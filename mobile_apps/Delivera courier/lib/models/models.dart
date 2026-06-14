// Datamodeller för Delivera Courier.
// Speglar `apps/courier/src/lib/types.ts` 1:1 så backend-kontraktet är identiskt.

enum VehicleType { bike, car }

VehicleType vehicleFrom(String? s) =>
    s == 'CAR' ? VehicleType.car : VehicleType.bike;

extension VehicleLabel on VehicleType {
  String get label => this == VehicleType.car ? 'Bil' : 'Cykel';
  String get api => this == VehicleType.car ? 'CAR' : 'BIKE';
}

enum DeliveryStatus { enRoutePickup, pickedUp, delivered }

DeliveryStatus statusFrom(String? s) {
  switch (s) {
    case 'PICKED_UP':
      return DeliveryStatus.pickedUp;
    case 'DELIVERED':
      return DeliveryStatus.delivered;
    default:
      return DeliveryStatus.enRoutePickup;
  }
}

enum ProofMethod { handed, leftAtDoor }

extension ProofApi on ProofMethod {
  String get api => this == ProofMethod.handed ? 'HANDED' : 'LEFT_AT_DOOR';
}

class LatLng {
  final double lat;
  final double lng;
  const LatLng(this.lat, this.lng);

  factory LatLng.fromJson(Map<String, dynamic>? j) =>
      LatLng((j?['lat'] as num?)?.toDouble() ?? 0, (j?['lng'] as num?)?.toDouble() ?? 0);

  bool get isValid => lat != 0 || lng != 0;
}

class OrderItem {
  final int qty;
  final String name;
  const OrderItem(this.qty, this.name);

  factory OrderItem.fromJson(Map<String, dynamic> j) =>
      OrderItem((j['qty'] as num?)?.toInt() ?? 1, (j['name'] ?? '') as String);
}

class Job {
  final String id;
  final String orderNumber;
  final String city;
  final String restaurantName;
  final String pickupAddress;
  final LatLng pickup;
  final String dropoffName;
  final String dropoffAddress;
  final LatLng dropoff;
  final double distanceKm;
  final int etaMin;
  final VehicleType vehicle;
  final double payout; // kr (inkl. ev. dricks beroende på backend)
  final double tip; // kr
  final int expiresAt; // epoch ms
  final List<OrderItem> items;

  const Job({
    required this.id,
    required this.orderNumber,
    required this.city,
    required this.restaurantName,
    required this.pickupAddress,
    required this.pickup,
    required this.dropoffName,
    required this.dropoffAddress,
    required this.dropoff,
    required this.distanceKm,
    required this.etaMin,
    required this.vehicle,
    required this.payout,
    required this.tip,
    required this.expiresAt,
    required this.items,
  });

  factory Job.fromJson(Map<String, dynamic> j) => Job(
        id: (j['id'] ?? '') as String,
        orderNumber: (j['orderNumber'] ?? '') as String,
        city: (j['city'] ?? '') as String,
        restaurantName: (j['restaurantName'] ?? '') as String,
        pickupAddress: (j['pickupAddress'] ?? '') as String,
        pickup: LatLng.fromJson(j['pickup'] as Map<String, dynamic>?),
        dropoffName: (j['dropoffName'] ?? '') as String,
        dropoffAddress: (j['dropoffAddress'] ?? '') as String,
        dropoff: LatLng.fromJson(j['dropoff'] as Map<String, dynamic>?),
        distanceKm: (j['distanceKm'] as num?)?.toDouble() ?? 0,
        etaMin: (j['etaMin'] as num?)?.toInt() ?? 0,
        vehicle: vehicleFrom(j['vehicle'] as String?),
        payout: (j['payout'] as num?)?.toDouble() ?? 0,
        tip: (j['tip'] as num?)?.toDouble() ?? 0,
        expiresAt: (j['expiresAt'] as num?)?.toInt() ?? 0,
        items: ((j['items'] as List?) ?? [])
            .whereType<Map<String, dynamic>>()
            .map(OrderItem.fromJson)
            .toList(),
      );

  int get itemCount => items.fold(0, (s, i) => s + i.qty);
}

class ActiveDelivery extends Job {
  final DeliveryStatus status;
  final int acceptedAt; // epoch ms
  // Tider + bevis (från backend) — driver detaljvyn "hur lång tid du tog på dig".
  final int? pickedUpAt; // epoch ms
  final int? deliveredAt; // epoch ms
  final int? pickupMin; // accept → hämtad
  final int? deliverMin; // hämtad → levererad
  final int? totalMin; // accept → levererad (eller accept → nu, live)
  final String? customerPhone;
  final String? deliveryNote;
  final String? proofMethod; // HANDED | LEFT_AT_DOOR
  final String? proofMessage;

  const ActiveDelivery({
    required super.id,
    required super.orderNumber,
    required super.city,
    required super.restaurantName,
    required super.pickupAddress,
    required super.pickup,
    required super.dropoffName,
    required super.dropoffAddress,
    required super.dropoff,
    required super.distanceKm,
    required super.etaMin,
    required super.vehicle,
    required super.payout,
    required super.tip,
    required super.expiresAt,
    required super.items,
    required this.status,
    required this.acceptedAt,
    this.pickedUpAt,
    this.deliveredAt,
    this.pickupMin,
    this.deliverMin,
    this.totalMin,
    this.customerPhone,
    this.deliveryNote,
    this.proofMethod,
    this.proofMessage,
  });

  factory ActiveDelivery.fromJson(Map<String, dynamic> j) {
    final base = Job.fromJson(j);
    return ActiveDelivery(
      id: base.id,
      orderNumber: base.orderNumber,
      city: base.city,
      restaurantName: base.restaurantName,
      pickupAddress: base.pickupAddress,
      pickup: base.pickup,
      dropoffName: base.dropoffName,
      dropoffAddress: base.dropoffAddress,
      dropoff: base.dropoff,
      distanceKm: base.distanceKm,
      etaMin: base.etaMin,
      vehicle: base.vehicle,
      payout: base.payout,
      tip: base.tip,
      expiresAt: base.expiresAt,
      items: base.items,
      status: statusFrom(j['status'] as String?),
      acceptedAt: (j['acceptedAt'] as num?)?.toInt() ?? 0,
      pickedUpAt: (j['pickedUpAt'] as num?)?.toInt(),
      deliveredAt: (j['deliveredAt'] as num?)?.toInt(),
      pickupMin: (j['pickupMin'] as num?)?.toInt(),
      deliverMin: (j['deliverMin'] as num?)?.toInt(),
      totalMin: (j['totalMin'] as num?)?.toInt(),
      customerPhone: j['customerPhone'] as String?,
      deliveryNote: j['deliveryNote'] as String?,
      proofMethod: j['proofMethod'] as String?,
      proofMessage: j['proofMessage'] as String?,
    );
  }
}

class HistoryOrder {
  final String id;
  final String orderNumber;
  final String restaurantName;
  final DateTime deliveredAt;
  final double distanceKm;
  final double payout;
  final int? totalMin; // hur lång tid leveransen tog (accept → levererad)

  const HistoryOrder({
    required this.id,
    required this.orderNumber,
    required this.restaurantName,
    required this.deliveredAt,
    required this.distanceKm,
    required this.payout,
    this.totalMin,
  });

  factory HistoryOrder.fromJson(Map<String, dynamic> j) => HistoryOrder(
        id: (j['id'] ?? '') as String,
        orderNumber: (j['orderNumber'] ?? '') as String,
        restaurantName: (j['restaurantName'] ?? '') as String,
        deliveredAt:
            DateTime.tryParse((j['deliveredAt'] ?? '') as String)?.toLocal() ??
                DateTime.now(),
        distanceKm: (j['distanceKm'] as num?)?.toDouble() ?? 0,
        payout: (j['payout'] as num?)?.toDouble() ?? 0,
        totalMin: (j['totalMin'] as num?)?.toInt(),
      );
}

class CourierProfile {
  final String id;
  final String name;
  final String email;
  final String city;
  final VehicleType vehicle;
  final String? phone;

  const CourierProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.city,
    required this.vehicle,
    this.phone,
  });

  factory CourierProfile.fromJson(Map<String, dynamic> j) => CourierProfile(
        id: (j['id'] ?? '') as String,
        name: (j['name'] ?? '') as String,
        email: (j['email'] ?? '') as String,
        city: (j['city'] ?? '') as String,
        vehicle: vehicleFrom(j['vehicle'] as String?),
        phone: j['phone'] as String?,
      );

  String get initials {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }
}
