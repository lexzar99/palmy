import Foundation

@MainActor
final class RestaurantDetailViewModel: ObservableObject {
    @Published private(set) var restaurant: Restaurant
    @Published private(set) var categories: [MenuCategory] = []
    @Published private(set) var isLoading = true
    @Published var selectedCategoryID: String?
    @Published var searchQuery = ""
    @Published var errorMessage: String?
    @Published var cartItems: [CartDraftItem] = []
    @Published private(set) var zoneAvailable: Bool?
    @Published private(set) var zoneDeliveryFee: Double?
    @Published private(set) var zoneMinOrderAmount: Double?
    @Published private(set) var zoneEtaMinutes: Int?
    @Published private(set) var zoneValidationFinished = false

    private let api = DeliveraAPI()

    init(restaurant: Restaurant) {
        self.restaurant = restaurant
    }

    var visibleCategories: [MenuCategory] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        var result = categories

        if let selectedCategoryID {
            result = result.filter { $0.id == selectedCategoryID }
        }

        if !query.isEmpty {
            result = result.compactMap { category in
                let products = category.products.filter { product in
                    product.name.localizedCaseInsensitiveContains(query) ||
                    (product.description?.localizedCaseInsensitiveContains(query) ?? false)
                }
                guard !products.isEmpty else { return nil }
                return MenuCategory(
                    id: category.id,
                    name: category.name,
                    slug: category.slug,
                    description: category.description,
                    imageUrl: category.imageUrl,
                    products: products
                )
            }
        }

        return result
    }

    var cartTotal: Double {
        cartItems.reduce(0) { $0 + $1.total }
    }

    var cartCount: Int {
        cartItems.reduce(0) { $0 + $1.quantity }
    }

    var displayDeliveryFee: Double {
        zoneDeliveryFee ?? restaurant.deliveryFee ?? 0
    }

    var displayMinOrderAmount: Double {
        zoneMinOrderAmount ?? restaurant.minOrderAmount ?? 0
    }

    var displayEtaMinutes: Int {
        zoneEtaMinutes ?? restaurant.etaMinutes ?? 30
    }

    var orderingEnabled: Bool {
        RestaurantAvailability.isOrderingEnabled(restaurant) && zoneAvailable != false
    }

    func load(orderMode: OrderMode, deliveryCoordinate: Coordinate?) async {
        isLoading = true
        errorMessage = nil
        zoneValidationFinished = false

        do {
            async let restaurantRequest = api.restaurant(slug: restaurant.slug)
            async let menuRequest = api.menu(slug: restaurant.slug)

            restaurant = try await restaurantRequest
            categories = try await menuRequest.categories.filter { !$0.products.isEmpty }
            selectedCategoryID = nil
            if orderMode == .delivery, let deliveryCoordinate {
                await validateZone(deliveryCoordinate)
            } else {
                zoneAvailable = nil
                zoneValidationFinished = true
            }
        } catch {
            errorMessage = "Kunde inte hämta menyn just nu."
            zoneValidationFinished = true
        }

        isLoading = false
    }

    func validateZone(_ coordinate: Coordinate) async {
        defer { zoneValidationFinished = true }
        do {
            let response = try await api.validateLocation(latitude: coordinate.lat, longitude: coordinate.lng)
            guard response.covered else {
                zoneAvailable = restaurant.isOpen == false ? nil : false
                return
            }

            let restaurants = response.cities.flatMap(\.restaurants)
            guard let match = restaurants.first(where: {
                $0.id == restaurant.id || $0.slug.localizedCaseInsensitiveCompare(restaurant.slug) == .orderedSame
            }) else {
                zoneAvailable = restaurant.isOpen == false ? nil : false
                return
            }

            if match.isOpen == false {
                zoneAvailable = nil
            } else {
                zoneAvailable = true
            }
            zoneDeliveryFee = match.matchedZone?.feeKr ?? match.deliveryFee.map { $0 / 100 }
            zoneMinOrderAmount = match.matchedZone?.minOrderKr ?? match.minOrderAmount.map { $0 / 100 }
            zoneEtaMinutes = match.matchedZone?.etaMinutes ?? match.etaMinutes
        } catch {
            zoneAvailable = nil
        }
    }

    func addToCart(
        _ product: MenuProduct,
        extras: [SelectedExtra] = [],
        quantity: Int = 1,
        paidWithPoints: Bool = false,
        dpointsUnitCost: Int? = nil
    ) {
        let lineKey = CartDraftItem.lineKey(productID: product.id, extras: extras, paidWithPoints: paidWithPoints)

        if let index = cartItems.firstIndex(where: { $0.lineKey == lineKey }) {
            cartItems[index].quantity += quantity
        } else {
            cartItems.append(
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

    func incrementCartItem(_ item: CartDraftItem) {
        guard let index = cartItems.firstIndex(where: { $0.id == item.id }) else { return }
        cartItems[index].quantity += 1
    }

    func decrementCartItem(_ item: CartDraftItem) {
        guard let index = cartItems.firstIndex(where: { $0.id == item.id }) else { return }
        if cartItems[index].quantity <= 1 {
            cartItems.remove(at: index)
        } else {
            cartItems[index].quantity -= 1
        }
    }

    func removeCartItem(_ item: CartDraftItem) {
        cartItems.removeAll { $0.id == item.id }
    }

    func clearCart() {
        cartItems.removeAll()
    }
}

struct SelectedExtra: Identifiable, Codable, Hashable {
    let groupId: String
    let groupName: String
    let extraId: String
    let name: String
    let price: Double
    let quantity: Int

    var id: String {
        "\(groupId)-\(extraId)"
    }

    var total: Double {
        price * Double(quantity)
    }
}

struct CartDraftItem: Identifiable, Codable, Hashable {
    let id: UUID
    let lineKey: String
    let productID: String
    let product: MenuProduct
    let name: String
    let unitPrice: Double
    let extras: [SelectedExtra]
    var quantity: Int
    let paidWithPoints: Bool
    let dpointsUnitCost: Int?

    init(
        id: UUID = UUID(),
        lineKey: String,
        productID: String,
        product: MenuProduct,
        name: String,
        unitPrice: Double,
        extras: [SelectedExtra],
        quantity: Int,
        paidWithPoints: Bool,
        dpointsUnitCost: Int?
    ) {
        self.id = id
        self.lineKey = lineKey
        self.productID = productID
        self.product = product
        self.name = name
        self.unitPrice = unitPrice
        self.extras = extras
        self.quantity = quantity
        self.paidWithPoints = paidWithPoints
        self.dpointsUnitCost = dpointsUnitCost
    }

    var unitTotal: Double {
        if paidWithPoints { return 0 }
        return unitPrice + extras.reduce(0) { $0 + $1.total }
    }

    var total: Double {
        unitTotal * Double(quantity)
    }

    static func lineKey(productID: String, extras: [SelectedExtra], paidWithPoints: Bool) -> String {
        let extrasKey = extras
            .sorted { $0.id < $1.id }
            .map { "\($0.id):\($0.quantity)" }
            .joined(separator: "|")
        return "\(productID)#\(paidWithPoints ? "points" : "cash")#\(extrasKey)"
    }
}
