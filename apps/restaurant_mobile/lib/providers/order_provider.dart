import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../core/api_client.dart';
import '../core/constants.dart';
import '../models/order_model.dart';

class OrderProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  List<OrderModel> _orders = [];
  bool _isLoading = false;
  IO.Socket? _socket;

  List<OrderModel> get orders => _orders;
  bool get isLoading => _isLoading;

  List<OrderModel> get pendingOrders => _orders.where((o) => o.status == 'PENDING').toList();
  List<OrderModel> get activeOrders => _orders.where((o) => 
      ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERING'].contains(o.status)).toList();

  Future<void> fetchOrders(String restaurantId) async {
    _isLoading = true;
    notifyListeners();

    try {
      final res = await _api.get('/api/admin/orders', queryParameters: {
        'restaurantId': restaurantId,
        'limit': 50,
      });

      if (res.statusCode == 200) {
        final List data = res.data['orders'];
        _orders = data.map((o) => OrderModel.fromJson(o)).toList();
      }
    } catch (e) {
      debugPrint('Error fetching orders: $e');
    }

    _isLoading = false;
    notifyListeners();
  }

  void initSocket(String restaurantId) {
    if (_socket != null) _socket!.disconnect();

    _socket = IO.io(AppConstants.socketUrl, IO.OptionBuilder()
      .setTransports(['websocket'])
      .enableAutoConnect()
      .build());

    _socket!.onConnect((_) {
      _socket!.emit('join:admin', {'restaurantId': restaurantId});
    });

    _socket!.on('order:new', (data) {
      final newOrder = OrderModel.fromJson(data);
      _orders.insert(0, newOrder);
      notifyListeners();
      // Trigger notification sound here if needed
    });

    _socket!.on('order:updated', (_) => fetchOrders(restaurantId));
  }

  Future<bool> updateStatus(String orderId, String status, {int? estimatedTime}) async {
    try {
      final res = await _api.patch('/api/admin/orders/$orderId/status', {
        'status': status,
        if (estimatedTime != null) 'estimatedTime': estimatedTime,
      });
      return res.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  @override
  void dispose() {
    _socket?.disconnect();
    super.dispose();
  }
}
