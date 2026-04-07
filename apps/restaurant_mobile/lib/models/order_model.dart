class OrderModel {
  final String id;
  final String orderNumber;
  final String status;
  final String type;
  final String customerName;
  final String customerPhone;
  final double total;
  final double deliveryFee;
  final DateTime createdAt;
  final String? deliveryStreet;
  final List<OrderItemModel> items;

  OrderModel({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.type,
    required this.customerName,
    required this.customerPhone,
    required this.total,
    required this.deliveryFee,
    required this.createdAt,
    this.deliveryStreet,
    required this.items,
  });

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    return OrderModel(
      id: json['id'],
      orderNumber: json['orderNumber'],
      status: json['status'],
      type: json['type'],
      customerName: json['customerName'],
      customerPhone: json['customerPhone'],
      total: (json['total'] as num).toDouble(),
      deliveryFee: (json['deliveryFee'] as num).toDouble(),
      createdAt: DateTime.parse(json['createdAt']),
      deliveryStreet: json['deliveryStreet'],
      items: (json['items'] as List)
          .map((i) => OrderItemModel.fromJson(i))
          .toList(),
    );
  }
}

class OrderItemModel {
  final String productName;
  final int quantity;
  final double subtotal;
  final List<dynamic> selectedExtras;

  OrderItemModel({
    required this.productName,
    required this.quantity,
    required this.subtotal,
    required this.selectedExtras,
  });

  factory OrderItemModel.fromJson(Map<String, dynamic> json) {
    return OrderItemModel(
      productName: json['productName'],
      quantity: json['quantity'] as int,
      subtotal: (json['subtotal'] as num).toDouble(),
      selectedExtras: json['selectedExtras'] is String 
          ? [] // Skip string if we don't need it right now
          : (json['selectedExtras'] as List? ?? []),
    );
  }
}
