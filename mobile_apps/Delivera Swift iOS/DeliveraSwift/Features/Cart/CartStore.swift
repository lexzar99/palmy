import Foundation

@MainActor
final class CartStore: ObservableObject {
    private static let persistenceKey = "delivera.swift.cart.v1"

    @Published private(set) var items: [CartDraftItem] = [] { didSet { persist() } }
    @Published private(set) var restaurant: Restaurant? { didSet { persist() } }
    @Published private(set) var orderMode: OrderMode = .delivery { didSet { persist() } }
    @Published private(set) var address = "" { didSet { persist() } }
    @Published private(set) var deliveryFee: Double = 0 { didSet { persist() } }
    @Published private(set) var deliveryCoordinate: Coordinate? { didSet { persist() } }
    @Published private(set) var recommendedProducts: [MenuProduct] = []
    @Published private(set) var appliedDiscount: DiscountValidationResponse? { didSet { persist() } }
    @Published private(set) var discountError: String?
    @Published private(set) var discountSuccess: String?
    @Published private(set) var isApplyingDiscount = false

    init() {
        restore()
    }

    var count: Int {
        items.reduce(0) { $0 + $1.quantity }
    }

    var subtotal: Double {
        items.reduce(0) { $0 + $1.total }
    }

    var discount: Double {
        guard let appliedDiscount else { return 0 }
        let codeDiscount = max(0, appliedDiscount.discountAmount ?? 0)
        let deliveryDiscount = appliedDiscount.freeDelivery == true ? deliveryFee : 0
        return min(subtotal + deliveryFee, codeDiscount + deliveryDiscount)
    }

    var vatRate: Double {
        restaurant?.vatPercent ?? 12
    }

    var vatAmount: Double {
        subtotal * vatRate / (100 + vatRate)
    }

    var total: Double {
        max(0, subtotal + deliveryFee - discount)
    }

    func configure(
        restaurant: Restaurant,
        orderMode: OrderMode,
        address: String,
        deliveryFee: Double,
        deliveryCoordinate: Coordinate? = nil,
        categories: [MenuCategory]
    ) {
        if requiresRestaurantSwitch(to: restaurant) {
            return
        }
        self.restaurant = restaurant
        self.orderMode = orderMode
        self.address = address
        self.deliveryFee = orderMode == .pickup ? 0 : deliveryFee
        self.deliveryCoordinate = deliveryCoordinate
        recommendedProducts = Self.recommendations(from: categories)
    }

    func replaceCartContext(
        restaurant: Restaurant,
        orderMode: OrderMode,
        address: String,
        deliveryFee: Double,
        deliveryCoordinate: Coordinate? = nil,
        categories: [MenuCategory]
    ) {
        items.removeAll()
        appliedDiscount = nil
        discountError = nil
        discountSuccess = nil
        self.restaurant = restaurant
        self.orderMode = orderMode
        self.address = address
        self.deliveryFee = orderMode == .pickup ? 0 : deliveryFee
        self.deliveryCoordinate = deliveryCoordinate
        recommendedProducts = Self.recommendations(from: categories)
    }

    func requiresRestaurantSwitch(to restaurant: Restaurant) -> Bool {
        guard !items.isEmpty, let current = self.restaurant else { return false }
        return current.id != restaurant.id
    }

    func updateFulfillment(orderMode: OrderMode, address: String, deliveryFee: Double, deliveryCoordinate: Coordinate? = nil) {
        self.orderMode = orderMode
        self.address = address
        self.deliveryFee = orderMode == .pickup ? 0 : deliveryFee
        self.deliveryCoordinate = deliveryCoordinate
    }

    func add(
        product: MenuProduct,
        extras: [SelectedExtra] = [],
        quantity: Int = 1,
        paidWithPoints: Bool = false,
        dpointsUnitCost: Int? = nil
    ) {
        let lineKey = CartDraftItem.lineKey(productID: product.id, extras: extras, paidWithPoints: paidWithPoints)
        if let index = items.firstIndex(where: { $0.lineKey == lineKey }) {
            items[index].quantity += quantity
        } else {
            items.append(
                CartDraftItem(
                    lineKey: lineKey,
                    productID: product.id,
                    product: product,
                    name: product.name,
                    unitPrice: paidWithPoints ? 0 : product.effectivePrice,
                    extras: extras,
                    quantity: quantity,
                    paidWithPoints: paidWithPoints,
                    dpointsUnitCost: dpointsUnitCost
                )
            )
        }
    }

    func replace(
        item: CartDraftItem,
        with product: MenuProduct,
        extras: [SelectedExtra],
        quantity: Int,
        paidWithPoints: Bool,
        dpointsUnitCost: Int?
    ) {
        remove(item)
        add(
            product: product,
            extras: extras,
            quantity: quantity,
            paidWithPoints: paidWithPoints,
            dpointsUnitCost: dpointsUnitCost
        )
    }

    func increment(_ item: CartDraftItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index].quantity += 1
    }

    func decrement(_ item: CartDraftItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        if items[index].quantity <= 1 {
            items.remove(at: index)
        } else {
            items[index].quantity -= 1
        }
    }

    func remove(_ item: CartDraftItem) {
        items.removeAll { $0.id == item.id }
    }

    func clear() {
        items.removeAll()
        restaurant = nil
        address = ""
        deliveryFee = 0
        deliveryCoordinate = nil
        recommendedProducts = []
        appliedDiscount = nil
        discountError = nil
        discountSuccess = nil
    }

    func clearDiscount() {
        appliedDiscount = nil
        discountError = nil
        discountSuccess = nil
    }

    func applyDiscount(code: String) async {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            appliedDiscount = nil
            discountSuccess = nil
            discountError = "Skriv en rabattkod först."
            return
        }

        isApplyingDiscount = true
        discountError = nil
        discountSuccess = nil
        defer { isApplyingDiscount = false }

        do {
            let response = try await DeliveraAPI().validateDiscount(code: trimmed, subtotal: subtotal)
            guard response.valid else {
                appliedDiscount = nil
                discountError = "Rabattkoden gäller inte."
                return
            }
            appliedDiscount = response
            discountSuccess = "\(response.code.uppercased()) är tillagd."
        } catch {
            appliedDiscount = nil
            discountError = error.localizedDescription
        }
    }

    private static func recommendations(from categories: [MenuCategory]) -> [MenuProduct] {
        let products = categories.flatMap(\.products)
            .filter { $0.effectivePrice > 0 && $0.effectivePrice < 70 }
            .sorted {
                if $0.hasImage != $1.hasImage { return $0.hasImage && !$1.hasImage }
                return $0.effectivePrice < $1.effectivePrice
            }
        return Array(products.prefix(7))
    }

    private func persist() {
        let snapshot = CartSnapshot(
            items: items,
            restaurant: restaurant.map(CartRestaurantSnapshot.init),
            orderModeRawValue: orderMode.rawValue,
            address: address,
            deliveryFee: deliveryFee,
            deliveryLatitude: deliveryCoordinate?.lat,
            deliveryLongitude: deliveryCoordinate?.lng,
            appliedDiscount: appliedDiscount
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: Self.persistenceKey)
    }

    private func restore() {
        guard let data = UserDefaults.standard.data(forKey: Self.persistenceKey),
              let snapshot = try? JSONDecoder().decode(CartSnapshot.self, from: data) else {
            return
        }
        items = snapshot.items
        restaurant = snapshot.restaurant?.restaurant
        orderMode = OrderMode(rawValue: snapshot.orderModeRawValue) ?? .delivery
        address = snapshot.address
        deliveryFee = orderMode == .pickup ? 0 : snapshot.deliveryFee
        if let lat = snapshot.deliveryLatitude, let lng = snapshot.deliveryLongitude {
            deliveryCoordinate = Coordinate(lat: lat, lng: lng)
        }
        appliedDiscount = snapshot.appliedDiscount
    }
}

private struct CartSnapshot: Codable {
    let items: [CartDraftItem]
    let restaurant: CartRestaurantSnapshot?
    let orderModeRawValue: String
    let address: String
    let deliveryFee: Double
    let deliveryLatitude: Double?
    let deliveryLongitude: Double?
    let appliedDiscount: DiscountValidationResponse?
}

private struct CartRestaurantSnapshot: Codable {
    let id: String
    let name: String
    let slug: String
    let cuisine: String?
    let description: String?
    let address: String?
    let city: String?
    let phone: String?
    let latitude: Double?
    let longitude: Double?
    let selfDelivery: Bool?
    let legalName: String?
    let organizationNumber: String?
    let imageUrl: String?
    let heroImageUrl: String?
    let rating: Double?
    let ratingCount: Int?
    let deliveryFee: Double?
    let minOrderAmount: Double?
    let vatPercent: Double?
    let etaMinutes: Int?
    let isOpen: Bool?
    let comingSoon: Bool?
    let pausedUntil: String?
    let featuredClass: Int?
    let tags: [String]?

    init(_ restaurant: Restaurant) {
        id = restaurant.id
        name = restaurant.name
        slug = restaurant.slug
        cuisine = restaurant.cuisine
        description = restaurant.description
        address = restaurant.address
        city = restaurant.city
        phone = restaurant.phone
        latitude = restaurant.latitude
        longitude = restaurant.longitude
        selfDelivery = restaurant.selfDelivery
        legalName = restaurant.legalName
        organizationNumber = restaurant.organizationNumber
        imageUrl = restaurant.imageUrl
        heroImageUrl = restaurant.heroImageUrl
        rating = restaurant.rating
        ratingCount = restaurant.ratingCount
        deliveryFee = restaurant.deliveryFee
        minOrderAmount = restaurant.minOrderAmount
        vatPercent = restaurant.vatPercent
        etaMinutes = restaurant.etaMinutes
        isOpen = restaurant.isOpen
        comingSoon = restaurant.comingSoon
        pausedUntil = restaurant.pausedUntil
        featuredClass = restaurant.featuredClass
        tags = restaurant.tags
    }

    var restaurant: Restaurant {
        Restaurant(
            id: id,
            name: name,
            slug: slug,
            cuisine: cuisine,
            description: description,
            address: address,
            city: city,
            phone: phone,
            latitude: latitude,
            longitude: longitude,
            selfDelivery: selfDelivery,
            legalName: legalName,
            organizationNumber: organizationNumber,
            imageUrl: imageUrl,
            heroImageUrl: heroImageUrl,
            rating: rating,
            ratingCount: ratingCount,
            deliveryFee: deliveryFee,
            minOrderAmount: minOrderAmount,
            vatPercent: vatPercent,
            etaMinutes: etaMinutes,
            isOpen: isOpen,
            comingSoon: comingSoon,
            pausedUntil: pausedUntil,
            featuredClass: featuredClass,
            tags: tags,
            openingHours: nil
        )
    }
}

struct DiscountValidationRequest: Encodable {
    let code: String
    let subtotal: Double
}

struct DiscountValidationResponse: Codable, Hashable {
    let valid: Bool
    let code: String
    let description: String?
    let type: String?
    let value: Double?
    let discountAmount: Double?
    let minOrder: Double?
    let freeDelivery: Bool?
}

struct CartOrderRequest: Encodable {
    let restaurantId: String?
    let restaurantSlug: String?
    let type: String
    let paymentMethod: String?
    let customerName: String
    let customerPhone: String
    let customerEmail: String?
    let deliveryStreet: String?
    let deliveryCity: String?
    let deliveryZip: String?
    let deliveryLatitude: Double?
    let deliveryLongitude: Double?
    let deliveryNote: String?
    let note: String?
    let discountCode: String?
    let items: [CartOrderItemRequest]
    let stripePaymentIntentId: String?
    let lat: Double?
    let lng: Double?
    let pendingPayment: Bool
    let tip: Double?
}

struct CartOrderItemRequest: Encodable {
    let productId: String
    let quantity: Int
    let note: String?
    let selectedExtras: [CartOrderExtraRequest]
    let paidWithPoints: Bool?
}

struct CartOrderExtraRequest: Encodable {
    let groupId: String
    let groupName: String
    let extraId: String
    let extraName: String
    let priceAddon: Double
    let quantity: Int
}

struct CartOrderResponse: Decodable {
    let orderId: String?
    let id: String?
    let estimatedTime: Int?
    let accessToken: String?
    let dpointsEarned: Int?
    let pointsEarned: Int?

    var resolvedOrderId: String? {
        orderId ?? id
    }
}

struct AuthenticatedCustomerProfile: Decodable, Hashable {
    let id: String?
    let name: String?
    let firstName: String?
    let lastName: String?
    let phone: String?
    let email: String?

    var displayName: String {
        let joined = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        if !joined.isEmpty { return joined }
        if let cleanName = name?.trimmingCharacters(in: .whitespacesAndNewlines), !cleanName.isEmpty {
            return cleanName
        }
        return "Kund"
    }
}

struct CustomerOrderResponse: Decodable {
    let id: String
    let orderNumber: FlexibleOrderNumber?
    let status: String
    let type: String?
    let total: Double
    let dpointsEarned: Int?
    let pointsEarned: Int?
    let deliveryFee: Double?
    let discountAmount: Double?
    let paymentStatus: String?
    let paymentMethod: String?
    let estimatedTime: Int?
    let customerPhone: String?
    let deliveryStreet: String?
    let deliveryLatitude: Double?
    let deliveryLongitude: Double?
    let restaurantLat: Double?
    let restaurantLng: Double?
    let restaurantName: String?
    let restaurantAddress: String?
    let restaurantCity: String?
    let restaurantPhone: String?
    let restaurantLegalName: String?
    let restaurantOrgNr: String?
    let restaurantVatPercent: Double?
    let selfDelivery: Bool?
    let courierAssigned: Bool?
    let courierLat: Double?
    let courierLng: Double?
    let courierName: String?
    let courierPhone: String?
    let courierVehicle: String?
    let courierLastSeenAt: String?
    let etaEndsAt: String?
    let createdAt: String?
    let preparingAt: String?
    let deliveringAt: String?
    let accessToken: String?
    let items: [CustomerOrderItemResponse]
}

struct FlexibleOrderNumber: Decodable {
    let value: String

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = String(int)
        } else if let double = try? container.decode(Double.self) {
            value = String(Int(double))
        } else {
            value = ""
        }
    }
}

struct CustomerOrderItemResponse: Decodable {
    let productName: String
    let quantity: Int
    let basePrice: Double?
    let subtotal: Double?
    let selectedExtras: [CartOrderExtraResponse]?
}

struct CartOrderExtraResponse: Decodable {
    let groupName: String?
    let extraName: String?
    let name: String?
    let quantity: Int?
    let priceAddon: Double?
}

struct AdyenPaymentCreateRequest: Encodable {
    let orderId: String
    let returnUrl: String
    let channel: String
    let storePaymentMethod: Bool
}

struct AdyenPaymentCreateResponse: Decodable {
    let provider: String?
    let paymentRef: String?
    let checkoutUrl: String?
    let session: AdyenSession?
    let total: Double?
    let discountAmount: Double?
}

struct AdyenSession: Decodable {
    let id: String
    let sessionData: String
}

struct AdyenVerifyRequest: Encodable {
    let orderId: String
    let sessionId: String
    let sessionResult: String
}

struct AdyenVerifyResponse: Decodable {
    let paid: Bool?
    let pending: Bool?
    let failed: Bool?
    let status: String?
}

struct LiveActivityTokenRequest: Encodable {
    let token: String
}

struct AbandonOrderRequest: Encodable {
    let phone: String?
}

struct EmptyAPIResponse: Decodable {}
