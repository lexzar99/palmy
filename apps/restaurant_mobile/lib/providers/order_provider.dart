import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:audioplayers/audioplayers.dart';
import '../core/api_client.dart';
import '../core/constants.dart';
import '../models/order_model.dart';

class OrderProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  final AudioPlayer _audioPlayer = AudioPlayer();
  List<OrderModel> _orders = [];
  bool _isLoading = false;
  IO.Socket? _socket;
  String? _restaurantId;
  String _selectedAlarm = 'order_notification.mp3';

  List<OrderModel> get orders => _orders;
  bool get isLoading => _isLoading;
  String get selectedAlarm => _selectedAlarm;

  void setAlarm(String alarm) {
    _selectedAlarm = alarm;
    notifyListeners();
  }

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

  // TOTALS for cards
  double get todayTotal => todayHistoryOrders
      .where((o) => !['CANCELLED', 'REJECTED'].contains(o.status))
      .fold(0.0, (sum, o) => sum + o.total);

  double get yesterdayTotal => yesterdayHistoryOrders
      .where((o) => !['CANCELLED', 'REJECTED'].contains(o.status))
      .fold(0.0, (sum, o) => sum + o.total);

  Future<void> fetchOrders(String restaurantId) async {
    _isLoading = true;
    _restaurantId = restaurantId;
    notifyListeners();

    try {
      final res = await _api.get('/api/admin/orders', queryParameters: {
        'restaurantId': restaurantId,
        'limit': '300',
      });

      if (res.statusCode == 200) {
        final List data = res.data['orders'] ?? res.data;
        _orders = data.map((o) => OrderModel.fromJson(o)).toList();
      }
    } catch (e) {
      debugPrint('Error fetching orders: $e');
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<List<dynamic>> fetchMenu(String restaurantId) async {
    try {
      // Use the correct API endpoint with restaurantId as query param
      final res = await _api.get('/api/menu/categories', queryParameters: {
        'restaurantId': restaurantId,
      });
      if (res.statusCode == 200) {
        return res.data;
      }
    } catch (e) {
      debugPrint('Error fetching menu: $e');
    }
    return [];
  }

  void initSocket(String restaurantId) {
    _restaurantId = restaurantId;
    if (_socket != null) _socket!.disconnect();

    _socket = IO.io(
        AppConstants.socketUrl,
        IO.OptionBuilder()
            .setTransports(['websocket'])
            .enableAutoConnect()
            .build());

    _socket!.onConnect((_) {
      _socket!.emit('join:admin', {'restaurantId': restaurantId});
      debugPrint('Connected to socket for restaurant: $restaurantId');
    });

    _socket!.on('order:new', (data) {
      final newOrder = OrderModel.fromJson(data);
      if (!_orders.any((o) => o.id == newOrder.id)) {
        _orders.insert(0, newOrder);
        playAlarm(); // Play notification sound
        notifyListeners();
      }
    });

    _socket!.on('order:updated', (_) => fetchOrders(restaurantId));
  }

  Future<void> playAlarm() async {
    try {
      await _audioPlayer.play(AssetSource('audio/$_selectedAlarm'));
    } catch (e) {
      debugPrint('Error playing sound: $e');
    }
  }

  Future<bool> updateStatus(String orderId, String status,
      {int? estimatedTime}) async {
    try {
      final body = <String, dynamic>{'status': status};
      if (estimatedTime != null) body['estimatedTime'] = estimatedTime;

      final res =
          await _api.patch('/api/admin/orders/$orderId/status', body);

      if (res.statusCode == 200) {
        // Optimistically update local state
        final idx = _orders.indexWhere((o) => o.id == orderId);
        if (idx != -1) {
          _orders[idx] = _orders[idx]
              .copyWith(status: status, estimatedTime: estimatedTime);
          notifyListeners();
        }
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Error updating status: $e');
      return false;
    }
  }

  void refresh() {
    if (_restaurantId != null) fetchOrders(_restaurantId!);
  }

  @override
  void dispose() {
    _socket?.disconnect();
    _audioPlayer.dispose();
    super.dispose();
  }
}
