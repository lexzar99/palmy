import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import '../core/api_client.dart';
import '../core/constants.dart';
import '../models/order_model.dart';
import '../core/audio_helper.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import 'package:flutter/services.dart';
import '../core/log_service.dart';
import '../core/print_service.dart';

class OrderProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  List<OrderModel> _orders = [];
  bool _isLoading = false;
  socket_io.Socket? _socket;
  String? _restaurantId;
  final String _selectedAlarm = 'notification.wav';
  bool _isRestaurantOpen = true;
  bool _isOffline = false;
  Timer? _alarmWatchdog;
  bool _socketInitializing = false;
  DateTime? _pausedUntil;
  Timer? _pauseTimer;
  String openingTime = '11:00';
  String closingTime = '21:00';
  String _lastKnownHours = '';

  List<OrderModel> get orders => _orders;
  bool get isLoading => _isLoading;
  String get selectedAlarm => _selectedAlarm;
  bool get isRestaurantOpen => _isRestaurantOpen;
  bool get isOffline => _isOffline;
  DateTime? get pausedUntil => _pausedUntil;
  bool get isPaused => _pausedUntil != null && _pausedUntil!.isAfter(DateTime.now());

  Future<void> pauseFor(int minutes) async {
    _pausedUntil = DateTime.now().add(Duration(minutes: minutes));
    await setStatus(false);
    _pauseTimer?.cancel();
    _pauseTimer = Timer(Duration(minutes: minutes), () {
      _pausedUntil = null;
      if (!_isRestaurantOpen) setStatus(true);
      notifyListeners();
    });
    notifyListeners();
  }

  Future<void> extendPause(int minutes) async {
    final base = _pausedUntil ?? DateTime.now();
    _pausedUntil = base.add(Duration(minutes: minutes));
    final remaining = _pausedUntil!.difference(DateTime.now());
    _pauseTimer?.cancel();
    _pauseTimer = Timer(remaining, () {
      _pausedUntil = null;
      if (!_isRestaurantOpen) setStatus(true);
      notifyListeners();
    });
    notifyListeners();
  }

  Future<void> cancelPause() async {
    _pauseTimer?.cancel();
    _pausedUntil = null;
    if (!_isRestaurantOpen) await setStatus(true);
    notifyListeners();
  }

  // ORDERS IN LIVE VIEW (Nya och Matlagning)
  List<OrderModel> get pendingOrders =>
      _orders.where((o) => o.status == 'PENDING').toList();

  // Active means ACCEPTED, PREPARING, READY (Wait for pickup)
  // For Delivery, once it's DELIVERING it goes to history.
  // For Pickup, READY is active until DELIVERED.
  List<OrderModel> get activeOrders => _orders
      .where((o) => (['ACCEPTED', 'PREPARING'].contains(o.status)))
      .toList();

  // FÖREGÅENDE ORDRAR på dashboard: ordrar som restaurangen jobbar på eller
  // nyss avvisade idag. När en order är på väg / klar / levererad → historik.
  List<OrderModel> get recentOrders {
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    const moveToHistory = ['DELIVERING', 'DELIVERED', 'COMPLETED', 'READY'];
    return _orders
        .where((o) =>
            o.status != 'PENDING' &&
            !moveToHistory.contains(o.status) &&
            o.createdAt.isAfter(startOfToday))
        .toList();
  }

  // HISTORY TAB FILTERS
  List<OrderModel> get todayHistoryOrders {
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);

    return _orders.where((o) {
      final isCompleted = [
        'READY',
        'DELIVERING',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      ].contains(o.status);
      return isCompleted &&
          o.createdAt.isAfter(startOfToday) &&
          !_isTestOrder(o);
    }).toList();
  }

  List<OrderModel> get yesterdayHistoryOrders {
    final now = DateTime.now();
    final startOfYesterday = DateTime(now.year, now.month, now.day - 1);
    final startOfToday = DateTime(now.year, now.month, now.day);

    return _orders.where((o) {
      final isCompleted = [
        'READY',
        'DELIVERING',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      ].contains(o.status);
      return isCompleted &&
          o.createdAt.isAfter(startOfYesterday) &&
          o.createdAt.isBefore(startOfToday) &&
          !_isTestOrder(o);
    }).toList();
  }

  bool _isTestOrder(OrderModel o) {
    if (o.id.startsWith('mock_')) return true;
    final code = o.discountCode?.toLowerCase() ?? '';
    if (code == 'test' || code == 'testa') return true;

    final name = o.customerName.toLowerCase();
    final note = o.note?.toLowerCase() ?? '';
    if (name.contains('test jari')) return true;
    if (note.contains('test-order') || note.contains('testorder')) return true;

    return false;
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
        OrderItemModel(
            productName: 'Test Pizza',
            quantity: 1,
            subtotal: 100,
            basePrice: 100,
            selectedExtras: []),
      ],
      total: 100,
      deliveryFee: 0,
      status: 'PENDING',
      type: 'DELIVERY',
      createdAt: DateTime.now(),
      discountCode: 'testa',
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
    _restaurantId = restaurantId;

    // 1. Immediately try to load from cache so user sees something while loading
    if (_orders.isEmpty) {
      _isLoading = true;
      notifyListeners();
      await _loadOrdersFromCache();
    }

    try {
      debugPrint('📡 FETCHING ORDERS for restaurant: $restaurantId');
      final res = await _api.get('/api/admin/orders', queryParameters: {
        'restaurantId': restaurantId,
        'limit': '50',
      });

      if (res.statusCode == 200) {
        final List data = res.data['orders'] ?? res.data;

        // Merge strategy: Keep existing mock orders but update with server data
        final List<OrderModel> serverOrders =
            data.map((o) => OrderModel.fromJson(o)).toList();
        final mockOrders =
            _orders.where((o) => o.id.startsWith('mock_')).toList();

        _orders = [...mockOrders, ...serverOrders];

        // Remove duplicates if any (cases where a mock becomes a real order)
        final seenIds = <String>{};
        _orders = _orders.where((o) => seenIds.add(o.id)).toList();

        // Sort: pending first, then by date desc
        _orders.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        logger.log(
            'SUCCESS: Fetched ${_orders.length} orders. Pending: ${pendingOrders.length}');
        _saveOrdersToCache();
      }
    } catch (e) {
      logger.log('FETCH ERROR: $e');
      if (_orders.isEmpty) {
        await _loadOrdersFromCache();
      }
    }

    _isLoading = false;
    _evaluateAlarms();
    notifyListeners();
    _fetchRestaurantStatus();
  }

  // Client-side auto-status check removed.
  // The backend now completely handles automated status transitions and broadcasts them via Socket.IO
  // using the 'status:auto-updated' event.

  bool isBeforeOpening() {
    final now = DateTime.now();
    final parts = openingTime.split(':');
    final openHour = int.parse(parts[0]);
    final openMinute = int.parse(parts[1]);

    if (now.hour < openHour) return true;
    if (now.hour == openHour && now.minute < openMinute) return true;
    return false;
  }

  Future<void> setStatus(bool open) async {
    if (_restaurantId == null) return;
    _isRestaurantOpen = open;
    notifyListeners();

    try {
      await _api.patch('/api/restaurants/$_restaurantId', {
        'isOpen': _isRestaurantOpen,
      });
      logger.log('STATUS SET: ${_isRestaurantOpen ? "OPEN" : "CLOSED"}');
    } catch (e) {
      logger.log('STATUS SET ERROR: $e');
      _isRestaurantOpen = !_isRestaurantOpen; // Rollback
      notifyListeners();
    }
  }

  Future<void> _saveOrdersToCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now();

      // Filter out completed/cancelled orders older than 2 days
      final cutoff = now.subtract(const Duration(days: 2));
      final validOrders = _orders.where((o) {
        if (!['COMPLETED', 'DELIVERED', 'CANCELLED', 'REJECTED']
            .contains(o.status)) return true;
        return o.createdAt.isAfter(cutoff);
      }).toList();

      final encoded = jsonEncode(validOrders.map((o) => o.toJson()).toList());
      await prefs.setString('cached_orders_$_restaurantId', encoded);
    } catch (e) {
      debugPrint('Cache saving error: $e');
    }
  }

  Future<void> _loadOrdersFromCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final encoded = prefs.getString('cached_orders_$_restaurantId');
      if (encoded != null) {
        final List data = jsonDecode(encoded);
        _orders = data.map((o) => OrderModel.fromJson(o)).toList();
        _evaluateAlarms();
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Cache loading error: $e');
    }
  }

  Future<void> _fetchRestaurantStatus() async {
    if (_restaurantId == null) return;
    try {
      final res = await _api.get('/api/restaurants');
      if (res.statusCode == 200) {
        final List data = res.data;
        final current = data.firstWhere((r) => r['id'] == _restaurantId,
            orElse: () => null);
        if (current != null) {
          _isRestaurantOpen =
              current['manualIsOpen'] ?? current['isOpen'] ?? true;

          final Map<String, dynamic> allHours = current['openingHours'] ?? {};
          final hoursString = allHours.toString();

          if (_lastKnownHours.isNotEmpty && _lastKnownHours != hoursString) {
            logger.log('ADMIN CHANGED SCHEDULE: Resetting manual override.');
          }
          _lastKnownHours = hoursString;

          final now = DateTime.now();
          final dayName = _getDayName(now.weekday).toLowerCase();

          // Look for day key case-insensitively
          dynamic dayData;
          allHours.forEach((key, value) {
            if (key.toLowerCase() == dayName) dayData = value;
          });

          if (dayData != null) {
            Map? slot;
            if (dayData is Map) {
              if (dayData.containsKey('open')) {
                slot = dayData;
              } else if (dayData.containsKey('shifts') &&
                  dayData['shifts'] is List &&
                  (dayData['shifts'] as List).isNotEmpty) {
                slot = dayData['shifts'][0];
              }
            }
            if (slot != null &&
                slot.containsKey('open') &&
                slot.containsKey('close')) {
              openingTime = slot['open'];
              closingTime = slot['close'];
              logger.log(
                  'SCHEDULE LOADED: $dayName is $openingTime - $closingTime');
            }
          }

          notifyListeners();
        }
      }
    } catch (e) {
      logger.log('ERROR FETCHING STATUS: $e');
    }
  }

  String _getDayName(int weekday) {
    switch (weekday) {
      case 1:
        return 'monday';
      case 2:
        return 'tuesday';
      case 3:
        return 'wednesday';
      case 4:
        return 'thursday';
      case 5:
        return 'friday';
      case 6:
        return 'saturday';
      case 7:
        return 'sunday';
      default:
        return 'monday';
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
      logger.log('STATUS TOGGLED: ${_isRestaurantOpen ? "OPEN" : "CLOSED"}');
    } catch (e) {
      logger.log('STATUS TOGGLE ERROR: $e');
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
      final res = await _api
          .patch('/api/admin/products/$productId', {'isActive': isActive});
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('Error updating product status: $e');
      return false;
    }
  }

  Future<bool> updateExtraStatus(String extraId, bool isActive) async {
    try {
      final res = await _api
          .patch('/api/admin/extras/$extraId', {'isActive': isActive});
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('Error updating extra status: $e');
      return false;
    }
  }

  Future<void> initSocket(String restaurantId) async {
    if (_socketInitializing) return;
    if (_socket != null &&
        _socket!.connected &&
        _restaurantId == restaurantId) {
      return; // Already initialized for this restaurant
    }
    _socketInitializing = true;
    _restaurantId = restaurantId;
    if (_socket != null) _socket!.dispose();

    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(AppConstants.tokenKey) ?? '';

    _socket = socket_io.io(
        AppConstants.socketUrl,
        socket_io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableAutoConnect()
            .setReconnectionAttempts(10)
            .setReconnectionDelay(2000)
            .build());

    _socket!.onConnect((_) {
      _isOffline = false;
      _socketInitializing = false;
      _socket!
          .emit('join:admin', {'restaurantId': restaurantId, 'token': token});
      logger.log('SOCKET CONNECTED: $restaurantId');
      notifyListeners();
    });

    _socket!.onConnectError((_) {
      _socketInitializing = false;
    });

    _socket!.on('order:new', (data) {
      debugPrint('📩 SOCKET: NEW ORDER RECEIVED: ${data['id']}');
      final newOrder = OrderModel.fromJson(data);
      if (!_orders.any((o) => o.id == newOrder.id)) {
        _orders.insert(0, newOrder);
        _saveOrdersToCache();

        // Foodora-feel: Play chime AND trigger heavy vibration immediately
        AudioHelper.playAudio(_selectedAlarm);
        HapticFeedback.vibrate();
        HapticFeedback.heavyImpact();

        unawaited(PrintService.printReceipt(newOrder, respectAutoPrint: true));

        _evaluateAlarms();
        notifyListeners();
      } else {
        debugPrint('📩 SOCKET: ORDER ALREADY EXISTS IN LIST');
      }
    });

    _socket!.onDisconnect((_) {
      _isOffline = true;
      logger.log('SOCKET DISCONNECTED');
      notifyListeners();
    });

    _socket!.on('order:updated', (data) {
      if (data is Map &&
          data.containsKey('orderId') &&
          data.containsKey('status')) {
        _updateLocalOrderStatus(
            data['orderId'].toString(),
            data['status'].toString(),
            data['estimatedTime'] != null
                ? int.tryParse(data['estimatedTime'].toString())
                : null);
      } else {
        fetchOrders(restaurantId);
      }
    });

    _socket!.on('settings:updated', (data) {
      debugPrint('📩 SOCKET EVENT: settings:updated RECEIVED: $data');
      if (data['restaurantId'] == _restaurantId ||
          data['restaurantId'].toString() == _restaurantId) {
        if (data.containsKey('isOpen')) {
          _isRestaurantOpen = data['isOpen'];
          notifyListeners();
        } else {
          _fetchRestaurantStatus();
        }
      }
    });

    _socket!.on('status:auto-updated', (data) {
      debugPrint('📩 SOCKET EVENT: status:auto-updated RECEIVED: $data');
      // This comes specifically from the server watchdog
      logger.log(
          'SOCKET: Status AUTO-UPDATED by server: ${data['isOpen'] ? "OPEN" : "CLOSED"}');
      _isRestaurantOpen = data['isOpen'];
      notifyListeners();
    });

    // Start watchdogs
    _alarmWatchdog?.cancel();
    _alarmWatchdog =
        Timer.periodic(const Duration(seconds: 10), (_) => _evaluateAlarms());

    // Removed client side status watchdog, rely on server push.
  }

  void _evaluateAlarms() {
    debugPrint(
        '📢 Watchdog: Evaluating alarms. Pending: ${pendingOrders.length}');
    if (pendingOrders.isNotEmpty) {
      // Intense "Dring-Dring" effect by playing/vibrating in a short sequence
      AudioHelper.startLooping(_selectedAlarm);

      // Pulse vibration every time watchdog runs (every 10s)
      HapticFeedback.vibrate();
      Future.delayed(const Duration(milliseconds: 500),
          () => HapticFeedback.heavyImpact());
      Future.delayed(
          const Duration(milliseconds: 1000), () => HapticFeedback.vibrate());
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

      final res = await _api.patch('/api/admin/orders/$orderId/status', body);

      if (res.statusCode == 200) {
        _updateLocalOrderStatus(orderId, status, estimatedTime);
        logger.log(
            'STATUS UPDATED: Order #$orderId -> $status ($estimatedTime min)');
        return true;
      }
      return false;
    } catch (e) {
      logger.log('UPDATE STATUS ERROR: $e');
      return false;
    }
  }

  void _updateLocalOrderStatus(
      String orderId, String status, int? estimatedTime) {
    final idx = _orders.indexWhere((o) => o.id == orderId);
    if (idx != -1) {
      _orders[idx] =
          _orders[idx].copyWith(status: status, estimatedTime: estimatedTime);
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
    _pauseTimer?.cancel();
    AudioHelper.stopLooping();
    super.dispose();
  }
}
