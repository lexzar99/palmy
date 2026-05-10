import 'dart:convert';

class OrderModel {
  final String id;
  final String orderNumber;
  final String status;
  final String type;
  final String customerName;
  final String customerPhone;
  final String? customerEmail;
  final double total;
  final double deliveryFee;
  final double discountAmount;
  final DateTime createdAt;
  final String? deliveryStreet;
  final String? deliveryCity;
  final String? deliveryZip;
  final String? deliveryNote;
  final String? deliveryInstructions;
  final String? note;
  final int? estimatedTime;
  final DateTime? scheduledFor;
  final String? paymentMethod;
  final String? discountCode;
  final String? allergens;
  final List<OrderItemModel> items;

  OrderModel({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.type,
    required this.customerName,
    required this.customerPhone,
    this.customerEmail,
    required this.total,
    required this.deliveryFee,
    this.discountAmount = 0,
    required this.createdAt,
    this.deliveryStreet,
    this.deliveryCity,
    this.deliveryZip,
    this.deliveryNote,
    this.deliveryInstructions,
    this.note,
    this.estimatedTime,
    this.scheduledFor,
    this.paymentMethod,
    this.discountCode,
    this.allergens,
    required this.items,
  });

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    return OrderModel(
      id: json['id'] ?? '',
      orderNumber: (json['orderNumber'] ?? '').toString().replaceAll('PX-', ''),
      status: json['status'] ?? 'PENDING',
      type: json['type'] ?? 'PICKUP',
      customerName: json['customerName'] ?? 'Okänd',
      customerPhone: json['customerPhone'] ?? '',
      customerEmail: json['customerEmail'],
      total: (json['total'] as num?)?.toDouble() ?? 0.0,
      deliveryFee: (json['deliveryFee'] as num?)?.toDouble() ?? 0.0,
      discountAmount: (json['discountAmount'] as num?)?.toDouble() ?? 0.0,
      createdAt: DateTime.tryParse(json['createdAt'] ?? '') ?? DateTime.now(),
      deliveryStreet: json['deliveryStreet'],
      deliveryCity: json['deliveryCity'],
      deliveryZip: json['deliveryZip'],
      deliveryNote: json['deliveryNote'],
      deliveryInstructions: json['deliveryInstructions'],
      note: json['note'],
      estimatedTime: json['estimatedTime'],
      scheduledFor: json['scheduledFor'] != null && json['scheduledFor'].toString().isNotEmpty
          ? DateTime.tryParse(json['scheduledFor'].toString())
          : null,
      paymentMethod: json['paymentMethod'],
      discountCode: json['discountCode'],
      allergens: json['allergens'],
      items: (json['items'] as List?)
              ?.map((i) => OrderItemModel.fromJson(i))
              .toList() ??
          [],
    );
  }

  OrderModel copyWith({String? status, int? estimatedTime, String? discountCode}) {
    return OrderModel(
      id: id,
      orderNumber: orderNumber,
      status: status ?? this.status,
      type: type,
      customerName: customerName,
      customerPhone: customerPhone,
      customerEmail: customerEmail,
      total: total,
      deliveryFee: deliveryFee,
      discountAmount: discountAmount,
      createdAt: createdAt,
      deliveryStreet: deliveryStreet,
      deliveryCity: deliveryCity,
      deliveryZip: deliveryZip,
      deliveryNote: deliveryNote,
      deliveryInstructions: deliveryInstructions,
      note: note,
      estimatedTime: estimatedTime ?? this.estimatedTime,
      scheduledFor: scheduledFor,
      paymentMethod: paymentMethod,
      discountCode: discountCode ?? this.discountCode,
      allergens: allergens,
      items: items,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'orderNumber': orderNumber,
      'status': status,
      'type': type,
      'customerName': customerName,
      'customerPhone': customerPhone,
      'customerEmail': customerEmail,
      'total': total,
      'deliveryFee': deliveryFee,
      'discountAmount': discountAmount,
      'createdAt': createdAt.toIso8601String(),
      'deliveryStreet': deliveryStreet,
      'deliveryCity': deliveryCity,
      'deliveryZip': deliveryZip,
      'deliveryNote': deliveryNote,
      'deliveryInstructions': deliveryInstructions,
      'note': note,
      'estimatedTime': estimatedTime,
      'scheduledFor': scheduledFor?.toIso8601String(),
      'paymentMethod': paymentMethod,
      'discountCode': discountCode,
      'allergens': allergens,
      'items': items.map((i) => i.toJson()).toList(),
    };
  }
}

class OrderItemModel {
  final String productName;
  final int quantity;
  final double subtotal;
  final double basePrice;
  final List<dynamic> selectedExtras;
  final String? note;

  OrderItemModel({
    required this.productName,
    required this.quantity,
    required this.subtotal,
    required this.basePrice,
    required this.selectedExtras,
    this.note,
  });

  factory OrderItemModel.fromJson(Map<String, dynamic> json) {
    var extrasRaw = json['selectedExtras'];
    List<dynamic> parsedExtras = [];
    
    if (extrasRaw is String) {
      try {
        parsedExtras = jsonDecode(extrasRaw);
      } catch (_) {
        if (extrasRaw.isNotEmpty && extrasRaw != "[]") {
          parsedExtras = [extrasRaw];
        }
      }
    } else if (extrasRaw is List) {
      parsedExtras = extrasRaw;
    }

    // MAP EXTRAS TO TEXT
    final List<String> extraTexts = parsedExtras.map((e) {
      if (e is Map) {
        return (e['extraName'] ?? e['name'] ?? "").toString();
      }
      return e.toString();
    }).where((s) => s.isNotEmpty).toList();

    String name = json['productName'] ?? 
                 json['product']?['name'] ?? 
                 json['name'] ?? 
                 'Okänd produkt';

    return OrderItemModel(
      productName: name,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0.0,
      basePrice: (json['basePrice'] as num?)?.toDouble() ?? 0.0,
      selectedExtras: extraTexts, // Now contains actual names like "Ris"
      note: json['note'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'productName': productName,
      'quantity': quantity,
      'subtotal': subtotal,
      'basePrice': basePrice,
      'selectedExtras': selectedExtras,
      'note': note,
    };
  }
}
