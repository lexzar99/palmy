import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:audioplayers/audioplayers.dart';
import '../core/api_client.dart';
import '../core/constants.dart';
import '../models/order_model.dart';
import '../core/audio_helper.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
class OrderProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  List<OrderModel> _orders = [];
  bool _isLoading = false;
  IO.Socket? _socket;
  String? _restaurantId;
  String _selectedAlarm = 'notification.wav';
  bool _isRestaurantOpen = true;
  bool _isOffline = false;
  Timer? _alarmWatchdog;

  List<OrderModel> get orders => _orders;
  bool get isLoading => _isLoading;
  String get selectedAlarm => _selectedAlarm;
  bool get isRestaurantOpen => _isRestaurantOpen;
  bool get isOffline => _isOffline;

  // ORDERS IN LIVE VIEW (Nya och Matlagning)
  List<OrderModel> get pendingOrders =>
      _orders.where((o) => o.status == 'PENDING').toList();

  // Active means ACCEPTED, PREPARING, READY (Wait for pickup)
  // For Delivery, once it's DELIVERING it goes to history. 
  // For Pickup, READY is active until DELIVERED.
  List<OrderModel> get activeOrders => _orders
      .where((o) =>
          (['ACCEPTED', 'PREPARING'].contains(o.status)) ||
          (o.status == 'READY' && o.type == 'PICKUP'))
      .toList();

  // HISTORY TAB FILTERS
  List<OrderModel> get todayHistoryOrders {
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    
    return _orders.where((o) {
      final isCompleted = ['DELIVERING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'].contains(o.status);
      return isCompleted && o.createdAt.isAfter(startOfToday);
    }).toList();
  }

  List<OrderModel> get yesterdayHistoryOrders {
    final now = DateTime.now();
    final startOfYesterday = DateTime(now.year, now.month, now.day - 1);
    final startOfToday = DateTime(now.year, now.month, now.day);
    
    return _orders.where((o) {
      final isCompleted = ['DELIVERING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'].contains(o.status);
      return isCompleted && o.createdAt.isAfter(startOfYesterday) && o.createdAt.isBefore(startOfToday);
    }).toList();
  }

  void simulateOrder() {
    final mockOrder = OrderModel(
      id: 'mock_${DateTime.now().millisecondsSinceEpoch}',
      orderNumber: (1000 + _orders.length).toString(),
      customerName: 'Test Jari',
      customerPhone: '070000000',
      deliveryStreet: 'Testgatan 1',
      deliveryCity: 'Testby',
      deliveryZip: '12345',
      items: [
        OrderItemModel(productName: 'Test Pizza', quantity: 1, subtotal: 100, basePrice: 100, selectedExtras: []),
      ],
      total: 100,
      deliveryFee: 0,
      status: 'PENDING',
      type: 'DELIVERY',
      createdAt: DateTime.now(),
      note: 'Dette är en test-order',
    );
    
    _orders.insert(0, mockOrder);
    _evaluateAlarms();
    _saveOrdersToCache();
    notifyListeners();
  }

  // TOTALS for cards
  double get todayTotal => todayHistoryOrders
      .where((o) => !['CANCELLED', 'REJECTED'].contains(o.status))
      .fold(0.0, (sum, o) => sum + o.total);

  double get yesterdayTotal => yesterdayHistoryOrders
      .where((o) => !['CANCELLED', 'REJECTED'].contains(o.status))
      .fold(0.0, (sum, o) => sum + o.total);

  Future<void> fetchOrders(String restaurantId) async {
    if (_orders.isEmpty) {
      _isLoading = true;
      notifyListeners();
    }
    _restaurantId = restaurantId;

    try {
      final res = await _api.get('/api/admin/orders', queryParameters: {
        'restaurantId': restaurantId,
        'limit': '300',
      });

      if (res.statusCode == 200) {
        final List data = res.data['orders'] ?? res.data;
        _orders = data.map((o) => OrderModel.fromJson(o)).toList();
        debugPrint('✅ FETCHED ${_orders.length} ORDERS. Pending: ${pendingOrders.length}');
        _saveOrdersToCache();
      }
    } catch (e) {
      debugPrint('Error fetching orders: $e');
      await _loadOrdersFromCache();
    }

    _isLoading = false;
    _evaluateAlarms(); // Check if we need to start ringing after refresh
    notifyListeners();
    _fetchRestaurantStatus();
  }

  Future<void> _saveOrdersToCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now();
      
      // Filter out completed/cancelled orders older than 2 days
      final cutoff = now.subtract(const Duration(days: 2));
      final validOrders = _orders.where((o) {
        if (!['COMPLETED', 'DELIVERED', 'CANCELLED', 'REJECTED'].contains(o.status)) return true;
        return o.createdAt.isAfter(cutoff);
      }).toList();

      final encoded = jsonEncode(validOrders.map((o) => o.toJson()).toList());
      await prefs.setString('cached_orders_${_restaurantId}', encoded);
    } catch (e) {
      debugPrint('Cache saving error: \$e');
    }
  }

  Future<void> _loadOrdersFromCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final encoded = prefs.getString('cached_orders_${_restaurantId}');
      if (encoded != null) {
        final List data = jsonDecode(encoded);
        _orders = data.map((o) => OrderModel.fromJson(o)).toList();
        _evaluateAlarms();
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Cache loading error: \$e');
    }
  }

  Future<void> _fetchRestaurantStatus() async {
    if (_restaurantId == null) return;
    try {
      final res = await _api.get('/api/restaurants');
      if (res.statusCode == 200) {
        final List data = res.data;
        final current = data.firstWhere((r) => r['id'] == _restaurantId, orElse: () => null);
        if (current != null) {
          _isRestaurantOpen = current['isOpen'] ?? true;
          notifyListeners();
        }
      }
    } catch (e) {
      debugPrint('Error fetching status: $e');
    }
  }

  Future<void> toggleRestaurantStatus() async {
    if (_restaurantId == null) return;
    _isRestaurantOpen = !_isRestaurantOpen;
    notifyListeners();

    try {
      await _api.patch('/api/restaurants/$_restaurantId', {
        'isOpen': _isRestaurantOpen,
      });
    } catch (e) {
      debugPrint('Error toggling status: $e');
      _isRestaurantOpen = !_isRestaurantOpen; // Rollback
      notifyListeners();
    }
  }

  Future<List<dynamic>> fetchMenu(String restaurantId) async {
    try {
      // Use ADMIN endpoint to get ALL products (even inactive) for toggle control.
      // includeGlobal=auto: if the restaurant has no own categories (like Palmyra which uses
      // restaurantId=null in the DB), the server will automatically return global categories.
      final res = await _api.get('/api/admin/categories', queryParameters: {
        'restaurantId': restaurantId,
        'includeProducts': 'true',
        'includeGlobal': 'auto',
      });
      if (res.statusCode == 200) {
        final data = res.data;
        final List<dynamic> categories = (data is List)
            ? data
            : (data is Map && data.containsKey('categories'))
                ? (data['categories'] as List<dynamic>)
                : <dynamic>[];

        // /api/admin/categories returns money fields in öre (inte kr).
        // Normalize to kr for UI consistency.
        for (final cat in categories) {
          if (cat is! Map) continue;
          final products = cat['products'];
          if (products is! List) continue;

          for (final prod in products) {
            if (prod is! Map) continue;
            final price = prod['price'];
            if (price is num) prod['price'] = price.toDouble() / 100.0;

            final groups = prod['extraGroups'];
            if (groups is! List) continue;
            for (final g in groups) {
              if (g is! Map) continue;
              final extraGroup = g['extraGroup'] ?? g;
              if (extraGroup is! Map) continue;
              final extras = extraGroup['extras'];
              if (extras is! List) continue;
              for (final e in extras) {
                if (e is! Map) continue;
                final addon = e['priceAddon'];
                if (addon is num) e['priceAddon'] = addon.toDouble() / 100.0;
              }
            }
          }
        }

        return categories;
      }
    } catch (e) {
      debugPrint('Error fetching menu: $e');
    }
    return [];
  }


  Future<bool> updateProductStatus(String productId, bool isActive) async {
    try {
      final res = await _api.patch('/api/admin/products/$productId', {'isActive': isActive});
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('Error updating product status: $e');
      return false;
    }
  }

  Future<bool> updateExtraStatus(String extraId, bool isActive) async {
    try {
      final res = await _api.patch('/api/admin/extras/$extraId', {'isActive': isActive});
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('Error updating extra status: $e');
      return false;
    }
  }

  void initSocket(String restaurantId) {
    if (_socket != null && _socket!.connected && _restaurantId == restaurantId) {
      return; // Already initialized for this restaurant
    }
    _restaurantId = restaurantId;
    if (_socket != null) _socket!.dispose();

    _socket = IO.io(
        AppConstants.socketUrl,
        IO.OptionBuilder()
            .setTransports(['websocket'])
            .enableAutoConnect()
            .build());

    _socket!.onConnect((_) {
      _isOffline = false;
      _socket!.emit('join:admin', {'restaurantId': restaurantId});
      debugPrint('Connected to socket for restaurant: $restaurantId');
      notifyListeners();
    });

    _socket!.on('order:new', (data) {
      debugPrint('📩 SOCKET: NEW ORDER RECEIVED: ${data['id']}');
      final newOrder = OrderModel.fromJson(data);
      if (!_orders.any((o) => o.id == newOrder.id)) {
        _orders.insert(0, newOrder);
        _saveOrdersToCache();
        // Play a short chime immediately for each new order (in addition to looping alarm).
        AudioHelper.playAudio(_selectedAlarm);
        _evaluateAlarms(); // Evaluates if we need to start ringing
        notifyListeners();
      } else {
        debugPrint('📩 SOCKET: ORDER ALREADY EXISTS IN LIST');
      }
    });

    _socket!.onDisconnect((_) {
      _isOffline = true;
      notifyListeners();
    });

    _socket!.on('order:updated', (_) => fetchOrders(restaurantId));
    
    // Start watchdog
    _alarmWatchdog?.cancel();
    _alarmWatchdog = Timer.periodic(const Duration(seconds: 10), (_) => _evaluateAlarms());
  }

  void _evaluateAlarms() {
    debugPrint('📢 Watchdog: Evaluating alarms. Pending: ${pendingOrders.length}');
    if (pendingOrders.isNotEmpty) {
       AudioHelper.startLooping(_selectedAlarm);
    } else {
       AudioHelper.stopLooping();
    }
  }

  Future<void> playDisconnectAlarm() async {
      await AudioHelper.playAudio('disconnect.wav');
  }

  // Used for settings menu
  Future<void> testAlarm() async {
    await AudioHelper.playTest(_selectedAlarm);
  }

  Future<bool> updateStatus(String orderId, String status,
      {int? estimatedTime}) async {
    try {
      final body = <String, dynamic>{'status': status};
      if (estimatedTime != null) body['estimatedTime'] = estimatedTime;

      // Handle mock/test orders locally (no API needed)
      if (orderId.startsWith('mock_')) {
        _updateLocalOrderStatus(orderId, status, estimatedTime);
        return true;
      }

      final res =
          await _api.patch('/api/admin/orders/$orderId/status', body);

      if (res.statusCode == 200) {
        _updateLocalOrderStatus(orderId, status, estimatedTime);
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Error updating status: $e');
      return false;
    }
  }

  void _updateLocalOrderStatus(String orderId, String status, int? estimatedTime) {
    final idx = _orders.indexWhere((o) => o.id == orderId);
    if (idx != -1) {
      _orders[idx] = _orders[idx]
          .copyWith(status: status, estimatedTime: estimatedTime);
      _saveOrdersToCache();
      _evaluateAlarms();
      notifyListeners();
    }
  }

  void refresh() {
    if (_restaurantId != null) fetchOrders(_restaurantId!);
  }

  @override
  void dispose() {
    _socket?.dispose();
    _alarmWatchdog?.cancel();
    AudioHelper.stopLooping();
    super.dispose();
  }
}
