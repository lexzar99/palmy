import SwiftUI
import MapKit
import UIKit

struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = HomeViewModel()
    @StateObject private var cartStore = CartStore()
    @StateObject private var locationService = LocationService()
    @State private var selectedCuisine = "Alla"
    @State private var orderMode: OrderMode = .delivery
    @State private var selectedTab: HomeTab = .home
    @AppStorage("delivera.deliveryAddress") private var deliveryAddress = "Malmö, Sweden"
    @AppStorage("delivera.deliveryCityName") private var deliveryCityName = "Malmö"
    @AppStorage("delivera.pickupCityName") private var pickupCityName = "Malmö"
    @AppStorage("delivera.deliveryLatitude") private var deliveryLatitude = 0.0
    @AppStorage("delivera.deliveryLongitude") private var deliveryLongitude = 0.0
    @AppStorage("delivera.recentDeliveryAddresses") private var recentDeliveryAddressesStorage = "[\"Malmö, Sweden\"]"
    @AppStorage("delivera.favoriteRestaurantIDs") private var favoriteRestaurantIDsStorage = "[]"
    @AppStorage("delivera.zoneRestaurants") private var zoneRestaurantsStorage = "{}"
    @AppStorage("delivera.cart.guestPhone") private var guestPhone = ""
    @AppStorage("delivera.debugTrackingOrderId") private var debugTrackingOrderId = ""
    @AppStorage("delivera.activeOrderId") private var activeOrderId = ""
    @AppStorage("delivera.activeOrderPhone") private var activeOrderPhone = ""
    @AppStorage("delivera.activeOrderToken") private var activeOrderToken = ""
    @State private var searchQuery = ""
    @State private var showingAddressSheet = false
    @State private var restaurantPath: [String] = []
    @State private var zoneRestaurants: [String: ZoneRestaurant] = [:]
    @State private var cartProductSheet: CartProductSheet?
    @State private var homeEntranceSeed = 0
    @State private var showingFavoritesSheet = false
    @State private var activeHomeOrder: ActiveHomeOrder?
    @State private var activeOrderSheet: ActiveOrderSheet?
    @State private var activeOrderTrackingError: String?
    @State private var isSeedingTrackingOrder = false
    @State private var isTrackingExpanded = false
    @State private var dpointsEarnRate = 0.1

    private var deliveryCoordinate: Coordinate? {
        guard deliveryLatitude != 0 || deliveryLongitude != 0 else { return nil }
        return Coordinate(lat: deliveryLatitude, lng: deliveryLongitude)
    }

    private var recentDeliveryAddresses: [String] {
        getStringArray(from: recentDeliveryAddressesStorage, fallback: ["Malmö, Sweden"])
    }

    private var favoriteRestaurantIDs: Set<String> {
        Set(getStringArray(from: favoriteRestaurantIDsStorage, fallback: []))
    }

    private var visibleRestaurants: [Restaurant] {
        model.filteredRestaurants(
            cuisine: selectedCuisine,
            searchQuery: searchQuery,
            cityName: activeCityName
        )
    }

    private var activeAddress: String {
        orderMode == .delivery ? deliveryAddress : pickupCityName
    }

    private var activeCityName: String? {
        orderMode == .delivery ? deliveryCityName : pickupCityName
    }

    var body: some View {
        NavigationStack(path: $restaurantPath) {
            ZStack {
                DeliveraTheme.appBackground.ignoresSafeArea()

                if selectedTab == .home {
                    homeContent
                } else if selectedTab == .cart {
                    CartView(
                        cartStore: cartStore,
                        isLoggedIn: false,
                        onPaymentCompleted: { order in
                            activeHomeOrder = order
                            activeOrderId = order.id
                            activeOrderPhone = guestPhone.trimmingCharacters(in: .whitespacesAndNewlines)
                            activeOrderToken = order.accessToken ?? ""
                            isTrackingExpanded = true
                            selectedTab = .home
                            Task { await LiveActivityManager.shared.startOrUpdate(order: order) }
                            if order.mode == .pickup {
                                Task { await updateActivePickupOrderWithCurrentLocation(orderId: order.id) }
                            }
                            triggerHomeEntrance()
                        },
                        onExploreRestaurants: { selectedTab = .home },
                        onPickRecommended: { cartProductSheet = CartProductSheet(product: $0, item: nil) },
                        onEditItem: { cartProductSheet = CartProductSheet(product: $0.product, item: $0) }
                    )
                } else if selectedTab == .rewards {
                    RewardsView(
                        isLoggedIn: false,
                        onOpenProfile: { selectedTab = .profile },
                        onOpenRestaurant: { slug, _ in
                            selectedTab = .home
                            restaurantPath.append(slug)
                        }
                    )
                } else if selectedTab == .profile {
                    ProfileView()
                } else {
                    ComingSoonTabView(title: selectedTab.title)
                }

                if !(selectedTab == .home && activeHomeOrder != nil && isTrackingExpanded) {
                    FloatingBottomNav(selected: $selectedTab, cartCount: cartStore.count)
                        .padding(.horizontal, 22)
                        .padding(.bottom, 12)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        .ignoresSafeArea(.keyboard, edges: .bottom)
                }
            }
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .navigationBarHidden(true)
            .navigationDestination(for: String.self) { slug in
                let restaurant = model.restaurants.first { $0.slug == slug } ?? model.restaurants.first { $0.id == slug }
                RestaurantDetailView(
                    restaurant: restaurant ?? Restaurant.placeholder(slug: slug),
                    orderMode: orderMode,
                    deliveryCoordinate: deliveryCoordinate,
                    activeAddress: activeAddress,
                    cartStore: cartStore,
                    isFavorite: restaurant.map { favoriteRestaurantIDs.contains($0.id) } ?? false,
                    onOpenCart: {
                        selectedTab = .cart
                        restaurantPath = []
                    },
                    onToggleFavorite: {
                        if let restaurant { toggleFavorite(restaurant) }
                    }
                )
                .navigationBarHidden(true)
            }
        }
        .task {
            zoneRestaurants = decodeZoneRestaurants()
            await model.load()
            await refreshZoneRestaurants()
            await loadDpointsEarnRate()
            await restoreActiveOrderIfNeeded()
            triggerHomeEntrance()
        }
        .task(id: zoneTaskID) {
            await refreshZoneRestaurants()
        }
        .task(id: activeHomeOrder?.id) {
            await pollActiveHomeOrderFromDatabase()
        }
        .onChange(of: restaurantPath) { _, path in
            guard path.isEmpty else { return }
            Task {
                await model.load()
                await refreshZoneRestaurants()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task {
                await model.load()
                await refreshZoneRestaurants()
            }
        }
        .onChange(of: selectedTab) { _, tab in
            if tab == .home {
                triggerHomeEntrance()
            }
        }
        .onChange(of: orderMode) { _, newMode in
            if newMode == .pickup, !deliveryCityName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                pickupCityName = deliveryCityName
            }
            syncCartFulfillment()
        }
        .onChange(of: deliveryAddress) { _, _ in
            syncCartFulfillment()
        }
        .onChange(of: pickupCityName) { _, _ in
            syncCartFulfillment()
        }
        .sheet(isPresented: $showingAddressSheet) {
            AddressSheetView(
                deliveryAddress: $deliveryAddress,
                deliveryCityName: $deliveryCityName,
                deliveryCoordinate: Binding(
                    get: { deliveryCoordinate },
                    set: { coordinate in
                        deliveryLatitude = coordinate?.lat ?? 0
                        deliveryLongitude = coordinate?.lng ?? 0
                    }
                ),
                pickupCityName: $pickupCityName,
                recentDeliveryAddresses: Binding(
                    get: { recentDeliveryAddresses },
                    set: { recentDeliveryAddressesStorage = encodeStringArray($0) }
                ),
                mode: $orderMode,
                cities: model.cities
            )
                .presentationDetents([.height(590), .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingFavoritesSheet) {
            FavoritesSheetView(
                restaurants: model.restaurants.filter { favoriteRestaurantIDs.contains($0.id) },
                onOpen: { restaurant in
                    showingFavoritesSheet = false
                    selectedTab = .home
                    restaurantPath.append(restaurant.slug)
                },
                onToggleFavorite: toggleFavorite
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $cartProductSheet) { sheet in
            ProductQuickView(
                product: sheet.product,
                restaurantIsOrderingEnabled: true,
                initialExtras: sheet.item?.extras ?? [],
                initialQuantity: sheet.item?.quantity ?? 1,
                primaryActionTitle: sheet.item == nil ? "Lägg till" : "Uppdatera",
                onAdd: { extras, quantity, paidWithPoints, dpointsUnitCost in
                    if let item = sheet.item {
                        cartStore.replace(
                            item: item,
                            with: sheet.product,
                            extras: extras,
                            quantity: quantity,
                            paidWithPoints: paidWithPoints,
                            dpointsUnitCost: dpointsUnitCost
                        )
                    } else {
                        cartStore.add(
                            product: sheet.product,
                            extras: extras,
                            quantity: quantity,
                            paidWithPoints: paidWithPoints,
                            dpointsUnitCost: dpointsUnitCost
                        )
                    }
                    cartProductSheet = nil
                }
            )
            .presentationDetents([.fraction(0.92), .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $activeOrderSheet) { sheet in
            ActiveOrderSheetView(sheet: sheet, order: activeHomeOrder ?? .preview)
                .presentationDetents(sheet == .receipt ? [.medium, .large] : [.height(430), .medium])
                .presentationDragIndicator(.visible)
        }
    }

    private var homeContent: some View {
        VStack(spacing: 0) {
            if let activeHomeOrder, isTrackingExpanded {
                trackingTakeover(order: activeHomeOrder)
            } else {
                HomeHeader(
                    address: activeAddress,
                    favoriteCount: favoriteRestaurantIDs.count,
                    mode: $orderMode,
                    searchQuery: $searchQuery,
                    onAddressTap: { showingAddressSheet = true },
                    onFavoritesTap: { showingFavoritesSheet = true }
                )
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 14)
                .background(.ultraThinMaterial)
                .homeEntrance(seed: homeEntranceSeed, direction: -1, delay: 0)

                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 22) {
                        if let error = model.errorMessage {
                            NoticeBanner(text: error)
                        }
                        if activeHomeOrder == nil, let activeOrderTrackingError {
                            NoticeBanner(text: "Trackingfel: \(activeOrderTrackingError)")
                        }

                        if let activeHomeOrder {
                            LiveActivityOrderBanner(order: activeHomeOrder, dpointsEarned: earnedDpoints(for: activeHomeOrder)) {
                                withAnimation(.spring(response: 0.62, dampingFraction: 0.78)) {
                                    isTrackingExpanded = true
                                }
                                triggerHomeEntrance()
                            }
                            .transition(.asymmetric(
                                insertion: .move(edge: .top).combined(with: .opacity),
                                removal: .scale(scale: 0.94).combined(with: .opacity)
                            ))
                            .homeEntrance(seed: homeEntranceSeed, direction: 1, delay: 0.03)

                            if let activeOrderTrackingError {
                                NoticeBanner(text: "Trackingfel: \(activeOrderTrackingError)")
                            }
                        }

                        SponsorRail(sponsors: model.sponsors, loading: model.isLoading)
                            .homeEntrance(seed: homeEntranceSeed, direction: 1, delay: 0.04)
                        CuisineChips(cuisines: model.cuisines, selected: $selectedCuisine)
                            .homeEntrance(seed: homeEntranceSeed, direction: -1, delay: 0.08)

                        ForEach(Array(model.sections.prefix(3).enumerated()), id: \.element.id) { index, section in
                            let restaurants = model.restaurants(for: section, cityName: activeCityName)
                            if !restaurants.isEmpty {
                                RestaurantRail(
                                    title: section.title,
                                    subtitle: section.subtitle ?? "Utvalt nära dig",
                                    restaurants: restaurants,
                                    zoneRestaurants: orderMode == .delivery ? zoneRestaurants : [:],
                                    orderMode: orderMode,
                                    favorites: favoriteRestaurantIDs,
                                    animationSeed: homeEntranceSeed,
                                    entranceDirection: index == 0 ? 1 : -1,
                                    onOpen: { restaurantPath.append($0.slug) },
                                    onToggleFavorite: { toggleFavorite($0) }
                                )
                            }
                        }

                        RestaurantList(
                            title: selectedCuisine == "Alla" ? "Alla restauranger" : selectedCuisine,
                            subtitle: "\(visibleRestaurants.count) restauranger",
                            restaurants: visibleRestaurants,
                            zoneRestaurants: orderMode == .delivery ? zoneRestaurants : [:],
                            orderMode: orderMode,
                            favorites: favoriteRestaurantIDs,
                            animationSeed: homeEntranceSeed,
                            entranceDirection: -1,
                            onOpen: { restaurantPath.append($0.slug) },
                            onToggleFavorite: { toggleFavorite($0) }
                        )
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 18)
                    .padding(.bottom, 112)
                }
                .refreshable {
                    await model.load()
                    await refreshZoneRestaurants()
                }
            }
        }
    }

    private func trackingTakeover(order: ActiveHomeOrder) -> some View {
        TrackingTakeoverView(
            order: order,
            ads: model.trackingAds,
            trackingError: activeOrderTrackingError,
            dpointsEarned: earnedDpoints(for: order),
            onShowHome: {
                withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                    isTrackingExpanded = false
                }
                triggerHomeEntrance()
            },
            onAction: { action in activeOrderSheet = action },
            onNextStatus: advanceTrackingStatus,
            onDeleteOrder: deleteActiveHomeOrder
        )
    }

    private func toggleFavorite(_ restaurant: Restaurant) {
        var favorites = favoriteRestaurantIDs
        if favorites.contains(restaurant.id) {
            favorites.remove(restaurant.id)
        } else {
            favorites.insert(restaurant.id)
        }
        favoriteRestaurantIDsStorage = encodeStringArray(Array(favorites))
    }

    private func triggerHomeEntrance() {
        homeEntranceSeed += 1
    }

    private func getStringArray(from value: String, fallback: [String]) -> [String] {
        guard let data = value.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String].self, from: data) else {
            return fallback
        }
        return decoded
    }

    private func encodeStringArray(_ values: [String]) -> String {
        guard let data = try? JSONEncoder().encode(values),
              let string = String(data: data, encoding: .utf8) else {
            return "[]"
        }
        return string
    }

    private var zoneTaskID: String {
        "\(orderMode.rawValue)-\(deliveryLatitude)-\(deliveryLongitude)"
    }

    private func refreshZoneRestaurants() async {
        guard orderMode == .delivery else {
            zoneRestaurants = [:]
            syncCartFulfillment()
            return
        }
        guard let deliveryCoordinate else {
            zoneRestaurants = decodeZoneRestaurants()
            syncCartFulfillment()
            return
        }

        do {
            let response = try await DeliveraAPI().validateLocation(latitude: deliveryCoordinate.lat, longitude: deliveryCoordinate.lng)
            var next: [String: ZoneRestaurant] = [:]
            for restaurant in response.cities.flatMap(\.restaurants) {
                next[restaurant.id] = restaurant
                next[restaurant.slug] = restaurant
            }
            zoneRestaurants = next
            zoneRestaurantsStorage = encodeZoneRestaurants(next)
            syncCartFulfillment()
        } catch {
            if zoneRestaurants.isEmpty {
                zoneRestaurants = decodeZoneRestaurants()
            }
            syncCartFulfillment()
        }
    }

    private func syncCartFulfillment() {
        guard cartStore.restaurant != nil else { return }
        cartStore.updateFulfillment(
            orderMode: orderMode,
            address: activeAddress,
            deliveryFee: currentCartDeliveryFee,
            deliveryCoordinate: deliveryCoordinate
        )
    }

    private var currentCartDeliveryFee: Double {
        guard orderMode == .delivery, let restaurant = cartStore.restaurant else { return 0 }
        let match = zoneRestaurants[restaurant.id] ?? zoneRestaurants[restaurant.slug]
        return match?.matchedZone?.feeKr ?? match?.deliveryFee.map { $0 / 100 } ?? restaurant.deliveryFee ?? 0
    }

    private func advanceTrackingStatus() {
        guard let activeHomeOrder else { return }
        withAnimation(.spring(response: 0.48, dampingFraction: 0.82)) {
            self.activeHomeOrder = activeHomeOrder.nextStatus()
        }
        if let activeHomeOrder = self.activeHomeOrder {
            Task { await LiveActivityManager.shared.startOrUpdate(order: activeHomeOrder) }
        }
    }

    private func deleteActiveHomeOrder() {
        guard let order = activeHomeOrder else { return }
        let phone = guestPhone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "0700000000" : guestPhone
        Task {
            await DeliveraAPI().abandonOrder(orderId: order.id, phone: phone)
            await LiveActivityManager.shared.end(orderId: order.id)
        }
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
            activeHomeOrder = nil
            activeOrderId = ""
            activeOrderPhone = ""
            activeOrderToken = ""
            activeOrderTrackingError = nil
            isTrackingExpanded = false
        }
        if debugTrackingOrderId == order.id {
            debugTrackingOrderId = ""
        }
        triggerHomeEntrance()
    }

    private func updateActivePickupOrderWithCurrentLocation(orderId: String) async {
        do {
            let location = try await locationService.requestLocation()
            let coordinate = Coordinate(lat: location.coordinate.latitude, lng: location.coordinate.longitude)
            await MainActor.run {
                guard let order = activeHomeOrder, order.id == orderId, order.mode == .pickup else { return }
                activeHomeOrder = order.withCustomerCoordinate(coordinate)
                if let activeHomeOrder {
                    Task { await LiveActivityManager.shared.startOrUpdate(order: activeHomeOrder) }
                }
            }
        } catch {
            await MainActor.run {
                activeOrderTrackingError = "Kunde inte hämta aktuell plats för avhämtning."
            }
        }
    }

    private func earnedDpoints(for order: ActiveHomeOrder) -> Int {
        Int((order.total * dpointsEarnRate).rounded())
    }

    private func loadDpointsEarnRate() async {
        if let response = try? await DeliveraAPI().settings(),
           let perKr = response.dpoints?.perKr,
           perKr > 0 {
            dpointsEarnRate = perKr
            return
        }

        if let response = try? await DeliveraAPI().dpointsRewardProducts(forceRefresh: false),
           let earnRate = response.earnRate,
           earnRate > 0 {
            dpointsEarnRate = earnRate
        }
    }

    private func pollActiveHomeOrderFromDatabase() async {
        guard let initialOrder = activeHomeOrder else { return }

        while !Task.isCancelled {
            let currentOrder = await MainActor.run { activeHomeOrder }
            guard let currentOrder, currentOrder.id == initialOrder.id else { return }
            let storedPhone = activeOrderPhone.trimmingCharacters(in: .whitespacesAndNewlines)
            let currentPhone = guestPhone.trimmingCharacters(in: .whitespacesAndNewlines)
            let proofPhone = currentPhone.isEmpty && storedPhone.isEmpty && currentOrder.id.hasPrefix("TEST-")
                ? "0700000000"
                : (currentPhone.isEmpty ? storedPhone : currentPhone)
            let proofToken = (currentOrder.accessToken ?? activeOrderToken).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !proofPhone.isEmpty || !proofToken.isEmpty else { return }

            do {
                let response = try await DeliveraAPI().customerOrder(id: currentOrder.id, phone: proofPhone, token: proofToken)
                await MainActor.run {
                    guard activeHomeOrder?.id == initialOrder.id else { return }
                    let updated = activeHomeOrder?.applyingDatabaseOrder(response)
                    activeHomeOrder = updated
                    activeOrderTrackingError = nil
                    activeOrderId = currentOrder.id
                    if !proofPhone.isEmpty {
                        activeOrderPhone = proofPhone
                    }
                    if let token = updated?.accessToken, !token.isEmpty {
                        activeOrderToken = token
                    } else if !proofToken.isEmpty {
                        activeOrderToken = proofToken
                    }
                    if let updated {
                        Task { await LiveActivityManager.shared.startOrUpdate(order: updated) }
                    }
                }
            } catch {
                await MainActor.run {
                    activeOrderTrackingError = error.localizedDescription
                }
            }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
        }
    }

    private func restoreActiveOrderIfNeeded() async {
        guard activeHomeOrder == nil, !activeOrderId.isEmpty else { return }
        let storedPhone = activeOrderPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentPhone = guestPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        let phone = storedPhone.isEmpty ? currentPhone : storedPhone
        let token = activeOrderToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !phone.isEmpty || !token.isEmpty else { return }

        do {
            let response = try await DeliveraAPI().customerOrder(id: activeOrderId, phone: phone, token: token)
            guard !HomeTrackingStatus.isRestorableTerminalStatus(response.status) else {
                activeOrderId = ""
                activeOrderPhone = ""
                activeOrderToken = ""
                return
            }
            activeHomeOrder = ActiveHomeOrder.preview.applyingDatabaseOrder(response)
            activeOrderToken = response.accessToken ?? token
            activeOrderTrackingError = nil
            isTrackingExpanded = false
            if let activeHomeOrder {
                await LiveActivityManager.shared.startOrUpdate(order: activeHomeOrder)
            }
        } catch {
            activeOrderTrackingError = error.localizedDescription
        }
    }

    private func seedRealTrackingOrderIfNeeded() async {
        guard !isSeedingTrackingOrder,
              activeHomeOrder?.id.hasPrefix("TEST-") == true,
              let restaurant = model.restaurants.first else {
            return
        }

        isSeedingTrackingOrder = true
        defer { isSeedingTrackingOrder = false }

        do {
            let api = DeliveraAPI()
            if !debugTrackingOrderId.isEmpty {
                do {
                    let existing = try await api.customerOrder(id: debugTrackingOrderId, phone: "0700000000")
                    activeHomeOrder = ActiveHomeOrder.preview.applyingDatabaseOrder(existing)
                    if let activeHomeOrder {
                        await LiveActivityManager.shared.startOrUpdate(order: activeHomeOrder)
                    }
                    isTrackingExpanded = false
                    return
                } catch {
                    debugTrackingOrderId = ""
                }
            }

            let menu = try await api.menu(slug: restaurant.slug)
            guard let product = menu.categories
                .flatMap(\.products)
                .first(where: { $0.effectivePrice > 0 && !$0.requiresConfiguration })
                ?? menu.categories.flatMap(\.products).first(where: { $0.effectivePrice > 0 }) else {
                return
            }

            let coordinate = deliveryCoordinate ?? Coordinate(lat: 55.5969, lng: 13.0007)
            let request = CartOrderRequest(
                restaurantId: restaurant.id,
                restaurantSlug: restaurant.slug,
                type: "DELIVERY",
                paymentMethod: "TEST",
                customerName: "Jalle Test",
                customerPhone: "0700000000",
                customerEmail: nil,
                deliveryStreet: activeAddress,
                deliveryCity: restaurant.city ?? activeCityName ?? "Malmö",
                deliveryZip: nil,
                deliveryLatitude: coordinate.lat,
                deliveryLongitude: coordinate.lng,
                deliveryNote: nil,
                note: "iOS live tracking test",
                discountCode: "test",
                items: [
                    CartOrderItemRequest(
                        productId: product.id,
                        quantity: 1,
                        note: nil,
                        selectedExtras: [],
                        paidWithPoints: nil
                    )
                ],
                stripePaymentIntentId: nil,
                lat: coordinate.lat,
                lng: coordinate.lng,
                pendingPayment: false,
                tip: nil
            )
            let response = try await api.createOrder(request, idempotencyKey: "swift-tracking-test-\(UUID().uuidString)")
            guard let orderId = response.resolvedOrderId else { return }
            debugTrackingOrderId = orderId
            activeHomeOrder = ActiveHomeOrder.paid(
                orderId: orderId,
                restaurant: restaurant,
                mode: .delivery,
                address: activeAddress,
                total: product.effectivePrice,
                coordinate: coordinate,
                accessToken: response.accessToken,
                status: .delivering,
                deliveryFee: 0,
                discountAmount: 0,
                items: [
                    ActiveOrderLine(name: product.name, quantity: 1, unitPrice: product.effectivePrice, extras: [])
                ]
            )
            if let activeHomeOrder {
                await LiveActivityManager.shared.startOrUpdate(order: activeHomeOrder)
            }
            isTrackingExpanded = false
        } catch {
            print("Tracking test order failed:", error.localizedDescription)
        }
    }

    private func decodeZoneRestaurants() -> [String: ZoneRestaurant] {
        guard let data = zoneRestaurantsStorage.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String: ZoneRestaurant].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private func encodeZoneRestaurants(_ value: [String: ZoneRestaurant]) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let string = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return string
    }
}

private enum HomeTab: String, CaseIterable, Identifiable {
    case home
    case cart
    case rewards
    case profile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .cart: return "Cart"
        case .rewards: return "Rewards"
        case .profile: return "Profile"
        }
    }

    var symbol: String {
        switch self {
        case .home: return "house.fill"
        case .cart: return "bag.fill"
        case .rewards: return "gift.fill"
        case .profile: return "person.fill"
        }
    }
}

private struct CartProductSheet: Identifiable {
    let id = UUID()
    let product: MenuProduct
    let item: CartDraftItem?
}

enum HomeTrackingStatus: String, CaseIterable, Identifiable {
    case pending
    case accepted
    case preparing
    case delivering
    case delivered

    var id: String { rawValue }

    var title: String {
        title(for: .delivery)
    }

    func title(for mode: OrderMode) -> String {
        switch self {
        case .pending: return "Väntar på godkännande"
        case .accepted: return "Tillagas"
        case .preparing: return "Tillagas"
        case .delivering: return mode == .pickup ? "Redo att hämtas" : "På väg"
        case .delivered: return mode == .pickup ? "Redo att hämtas" : "Levererad"
        }
    }

    var subtitle: String {
        subtitle(for: .delivery)
    }

    func subtitle(for mode: OrderMode) -> String {
        switch self {
        case .pending: return "Restaurangen går igenom ordern."
        case .accepted: return "Din mat tillagas just nu."
        case .preparing: return "Din mat tillagas just nu."
        case .delivering: return mode == .pickup ? "Ordern väntar hos restaurangen." : "Budet rör sig mot dig."
        case .delivered: return mode == .pickup ? "Ordern väntar hos restaurangen." : "Ordern är klar. Smaklig måltid."
        }
    }

    func bodyLine(dpoints: Int) -> String {
        bodyLine(dpoints: dpoints, mode: .delivery)
    }

    func bodyLine(dpoints: Int, mode: OrderMode) -> String {
        switch self {
        case .pending: return "Vi väntar på att restaurangen godkänner beställningen."
        case .accepted: return "Din mat lagas nu med färska ingredienser."
        case .preparing: return "Din mat lagas nu med färska ingredienser."
        case .delivering: return mode == .pickup ? "Du kan hämta din mat när du är framme." : "Vi jobbar hårt för att leverera din beställning."
        case .delivered: return "Du tjänade \(dpoints) Dpoints på beställningen."
        }
    }

    var color: Color {
        switch self {
        case .pending: return Color(red: 0.98, green: 0.74, blue: 0.12)
        case .accepted: return Color(red: 1.0, green: 0.56, blue: 0.12)
        case .preparing: return DeliveraTheme.orange
        case .delivering: return Color(red: 0.98, green: 0.34, blue: 0.09)
        case .delivered: return Color(red: 0.07, green: 0.66, blue: 0.33)
        }
    }

    var progress: Double {
        progress(for: .delivery)
    }

    func progress(for mode: OrderMode) -> Double {
        switch self {
        case .pending: return 0.0
        case .accepted, .preparing: return mode == .pickup ? 0.5 : 0.34
        case .delivering: return mode == .pickup ? 1.0 : 0.67
        case .delivered: return 1.0
        }
    }

    func next(for mode: OrderMode) -> HomeTrackingStatus {
        let all = Self.trackingSteps(for: mode)
        let index = all.firstIndex(of: self) ?? 0
        return all[(index + 1) % all.count]
    }

    static func trackingSteps(for mode: OrderMode) -> [HomeTrackingStatus] {
        mode == .pickup ? [.pending, .preparing, .delivering] : [.pending, .preparing, .delivering, .delivered]
    }
}

struct ActiveHomeOrder: Identifiable, Equatable {
    let id: String
    let accessToken: String?
    let orderNumber: String?
    let restaurantName: String
    let restaurantLegalName: String?
    let restaurantOrgNumber: String?
    let restaurantAddress: String?
    let restaurantPhone: String?
    let restaurantVatPercent: Double
    let status: HomeTrackingStatus
    let statusTitle: String
    let statusSubtitle: String
    let etaText: String
    let mode: OrderMode
    let address: String
    let total: Double
    let deliveryFee: Double
    let discountAmount: Double
    let items: [ActiveOrderLine]
    let selfDelivery: Bool
    let courierName: String?
    let courierAssigned: Bool
    let courierHasLiveLocation: Bool
    let restaurantLatitude: Double
    let restaurantLongitude: Double
    let customerLatitude: Double
    let customerLongitude: Double
    let courierLatitude: Double
    let courierLongitude: Double

    static let preview = ActiveHomeOrder(
        id: "TEST-\(Int(Date().timeIntervalSince1970))",
        accessToken: nil,
        orderNumber: nil,
        restaurantName: "Palmyra Pizzeria",
        restaurantLegalName: "Palmyra Pizzeria AB",
        restaurantOrgNumber: nil,
        restaurantAddress: "Malmö, Sweden",
        restaurantPhone: nil,
        restaurantVatPercent: 12,
        status: .delivering,
        statusTitle: "På väg till dig",
        statusSubtitle: "Restaurangen packar klart. Vi följer ordern live.",
        etaText: "18 min",
        mode: .delivery,
        address: "Malmö, Sweden",
        total: 199,
        deliveryFee: 0,
        discountAmount: 0,
        items: [
            ActiveOrderLine(name: "2 Pizza Combo", quantity: 1, unitPrice: 199, extras: [])
        ],
        selfDelivery: false,
        courierName: "Delivera",
        courierAssigned: true,
        courierHasLiveLocation: true,
        restaurantLatitude: 55.6046,
        restaurantLongitude: 13.0038,
        customerLatitude: 55.5969,
        customerLongitude: 13.0007,
        courierLatitude: 55.6010,
        courierLongitude: 13.0024
    )

    static func paid(
        orderId: String,
        restaurant: Restaurant,
        mode: OrderMode,
        address: String,
        total: Double,
        coordinate: Coordinate?,
        accessToken: String? = nil,
        status: HomeTrackingStatus = .pending,
        deliveryFee: Double = 0,
        discountAmount: Double = 0,
        items: [ActiveOrderLine] = []
    ) -> ActiveHomeOrder {
        let customerLat = coordinate?.lat ?? 55.5969
        let customerLng = coordinate?.lng ?? 13.0007
        let restaurantLat = restaurant.latitude ?? customerLat + 0.006
        let restaurantLng = restaurant.longitude ?? customerLng + 0.004
        let lines = items.isEmpty ? [ActiveOrderLine(name: "Beställning", quantity: 1, unitPrice: total, extras: [])] : items
        return ActiveHomeOrder(
            id: orderId,
            accessToken: accessToken,
            orderNumber: nil,
            restaurantName: restaurant.name,
            restaurantLegalName: restaurant.legalName,
            restaurantOrgNumber: restaurant.organizationNumber,
            restaurantAddress: [restaurant.address, restaurant.city].compactMap { $0 }.joined(separator: ", "),
            restaurantPhone: restaurant.phone,
            restaurantVatPercent: restaurant.vatPercent ?? 12,
            status: status,
            statusTitle: mode == .delivery ? "Ordern är igång" : "Förbereds",
            statusSubtitle: mode == .delivery ? "Vi visar live-status här när betalningen är klar." : "Vi säger till när den är redo att hämtas.",
            etaText: "\(restaurant.etaMinutes ?? 25) min",
            mode: mode,
            address: address,
            total: total,
            deliveryFee: mode == .pickup ? 0 : deliveryFee,
            discountAmount: discountAmount,
            items: lines,
            selfDelivery: restaurant.selfDelivery ?? false,
            courierName: (restaurant.selfDelivery ?? false) ? restaurant.name : nil,
            courierAssigned: false,
            courierHasLiveLocation: false,
            restaurantLatitude: restaurantLat,
            restaurantLongitude: restaurantLng,
            customerLatitude: customerLat,
            customerLongitude: customerLng,
            courierLatitude: restaurantLat + (customerLat - restaurantLat) * status.progress(for: mode),
            courierLongitude: restaurantLng + (customerLng - restaurantLng) * status.progress(for: mode)
        )
    }

    var liveCourierLatitude: Double {
        courierHasLiveLocation ? courierLatitude : restaurantLatitude + (customerLatitude - restaurantLatitude) * trackingProgress
    }

    var liveCourierLongitude: Double {
        courierHasLiveLocation ? courierLongitude : restaurantLongitude + (customerLongitude - restaurantLongitude) * trackingProgress
    }

    var shouldShowCourierLocation: Bool {
        mode == .delivery && !selfDelivery && courierAssigned && courierHasLiveLocation && status == .delivering
    }

    var displayStatusTitle: String {
        status.title(for: mode)
    }

    var displayStatusSubtitle: String {
        status.subtitle(for: mode)
    }

    var trackingProgress: Double {
        status.progress(for: mode)
    }

    var trackingSteps: [HomeTrackingStatus] {
        HomeTrackingStatus.trackingSteps(for: mode)
    }

    func nextStatus() -> ActiveHomeOrder {
        ActiveHomeOrder(
            id: id,
            accessToken: accessToken,
            orderNumber: orderNumber,
            restaurantName: restaurantName,
            restaurantLegalName: restaurantLegalName,
            restaurantOrgNumber: restaurantOrgNumber,
            restaurantAddress: restaurantAddress,
            restaurantPhone: restaurantPhone,
            restaurantVatPercent: restaurantVatPercent,
            status: status.next(for: mode),
            statusTitle: statusTitle,
            statusSubtitle: statusSubtitle,
            etaText: status == .delivered ? "0 min" : etaText,
            mode: mode,
            address: address,
            total: total,
            deliveryFee: deliveryFee,
            discountAmount: discountAmount,
            items: items,
            selfDelivery: selfDelivery,
            courierName: courierName,
            courierAssigned: courierAssigned,
            courierHasLiveLocation: courierHasLiveLocation,
            restaurantLatitude: restaurantLatitude,
            restaurantLongitude: restaurantLongitude,
            customerLatitude: customerLatitude,
            customerLongitude: customerLongitude,
            courierLatitude: courierLatitude,
            courierLongitude: courierLongitude
        )
    }

    func withCustomerCoordinate(_ coordinate: Coordinate) -> ActiveHomeOrder {
        ActiveHomeOrder(
            id: id,
            accessToken: accessToken,
            orderNumber: orderNumber,
            restaurantName: restaurantName,
            restaurantLegalName: restaurantLegalName,
            restaurantOrgNumber: restaurantOrgNumber,
            restaurantAddress: restaurantAddress,
            restaurantPhone: restaurantPhone,
            restaurantVatPercent: restaurantVatPercent,
            status: status,
            statusTitle: statusTitle,
            statusSubtitle: statusSubtitle,
            etaText: etaText,
            mode: mode,
            address: address,
            total: total,
            deliveryFee: deliveryFee,
            discountAmount: discountAmount,
            items: items,
            selfDelivery: selfDelivery,
            courierName: courierName,
            courierAssigned: courierAssigned,
            courierHasLiveLocation: courierHasLiveLocation,
            restaurantLatitude: restaurantLatitude,
            restaurantLongitude: restaurantLongitude,
            customerLatitude: coordinate.lat,
            customerLongitude: coordinate.lng,
            courierLatitude: courierLatitude,
            courierLongitude: courierLongitude
        )
    }

    func applyingDatabaseOrder(_ order: CustomerOrderResponse) -> ActiveHomeOrder {
        let nextMode: OrderMode = (order.type ?? "").uppercased() == "PICKUP" ? .pickup : mode
        let status = HomeTrackingStatus(apiStatus: order.status, mode: nextMode)
        let restaurantLat = order.restaurantLat ?? restaurantLatitude
        let restaurantLng = order.restaurantLng ?? restaurantLongitude
        let customerLat = order.deliveryLatitude ?? customerLatitude
        let customerLng = order.deliveryLongitude ?? customerLongitude
        let isSelfDelivery = order.selfDelivery ?? selfDelivery
        let hasCourierLocation = order.courierLat != nil && order.courierLng != nil
        let assignedCourier = (order.courierAssigned ?? courierAssigned) && !isSelfDelivery
        let nextCourierLat = order.courierLat ?? courierLatitude
        let nextCourierLng = order.courierLng ?? courierLongitude
        let lineItems = order.items.map { item in
            ActiveOrderLine(
                name: item.productName,
                quantity: item.quantity,
                unitPrice: item.basePrice ?? ((item.subtotal ?? 0) / Double(max(item.quantity, 1))),
                extras: (item.selectedExtras ?? []).compactMap { extra in
                    let name = extra.extraName ?? extra.name
                    guard let name, !name.isEmpty else { return nil }
                    return "\(extra.quantity ?? 1)x \(name)"
                }
            )
        }

        return ActiveHomeOrder(
            id: id,
            accessToken: order.accessToken ?? accessToken,
            orderNumber: order.orderNumber?.value ?? orderNumber,
            restaurantName: order.restaurantName ?? restaurantName,
            restaurantLegalName: order.restaurantLegalName ?? restaurantLegalName,
            restaurantOrgNumber: order.restaurantOrgNr ?? restaurantOrgNumber,
            restaurantAddress: order.restaurantAddress ?? restaurantAddress,
            restaurantPhone: order.restaurantPhone ?? restaurantPhone,
            restaurantVatPercent: order.restaurantVatPercent ?? restaurantVatPercent,
            status: status,
            statusTitle: status.title(for: nextMode),
            statusSubtitle: status.subtitle(for: nextMode),
            etaText: order.estimatedTime.map { "\($0) min" } ?? etaText,
            mode: nextMode,
            address: order.deliveryStreet ?? address,
            total: order.total,
            deliveryFee: order.deliveryFee ?? deliveryFee,
            discountAmount: order.discountAmount ?? discountAmount,
            items: lineItems.isEmpty ? items : lineItems,
            selfDelivery: isSelfDelivery,
            courierName: order.courierName ?? courierName,
            courierAssigned: assignedCourier,
            courierHasLiveLocation: hasCourierLocation,
            restaurantLatitude: restaurantLat,
            restaurantLongitude: restaurantLng,
            customerLatitude: customerLat,
            customerLongitude: customerLng,
            courierLatitude: nextCourierLat,
            courierLongitude: nextCourierLng
        )
    }

    var subtotal: Double {
        items.reduce(0) { $0 + $1.total }
    }

    var displayOrderNumber: String {
        if let orderNumber {
            return "#\(orderNumber)"
        }
        return "#\(id)"
    }

    var vatAmount: Double {
        total * restaurantVatPercent / (100 + restaurantVatPercent)
    }
}

private extension HomeTrackingStatus {
    static func isRestorableTerminalStatus(_ status: String) -> Bool {
        switch status.uppercased() {
        case "DELIVERED", "COMPLETED", "CANCELLED", "CANCELED", "REJECTED", "FAILED", "PAYMENT_FAILED":
            return true
        default:
            return false
        }
    }

    init(apiStatus: String, mode: OrderMode = .delivery) {
        switch apiStatus.uppercased() {
        case "ACCEPTED", "CONFIRMED", "APPROVED":
            self = .preparing
        case "PREPARING", "COOKING", "IN_PROGRESS", "READY", "READY_FOR_PICKUP", "PICKUP_READY":
            self = mode == .pickup && apiStatus.uppercased().contains("READY") ? .delivering : .preparing
        case "DELIVERING", "OUT_FOR_DELIVERY", "PICKED_UP", "ON_THE_WAY", "IN_DELIVERY":
            self = .delivering
        case "DELIVERED", "COMPLETED":
            self = .delivered
        default:
            self = .pending
        }
    }
}

struct ActiveOrderLine: Identifiable, Equatable, Hashable {
    let id = UUID()
    let name: String
    let quantity: Int
    let unitPrice: Double
    let extras: [String]

    var total: Double {
        unitPrice * Double(quantity)
    }
}

private struct HomeCompactHeader: View {
    let address: String
    let favoriteCount: Int
    let onAddressTap: () -> Void
    let onFavoritesTap: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onAddressTap) {
                HStack(spacing: 8) {
                    Image(systemName: "location.fill")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(DeliveraTheme.orange)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Levererar till")
                            .font(.system(size: 10, weight: .black))
                            .foregroundStyle(DeliveraTheme.muted)
                        Text(address)
                            .font(.system(size: 14, weight: .black, design: .rounded))
                            .foregroundStyle(DeliveraTheme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
                .padding(.horizontal, 13)
                .frame(height: 48)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)

            Button(action: onFavoritesTap) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 17, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                        .frame(width: 48, height: 48)
                        .background(.white.opacity(0.9), in: Circle())
                    if favoriteCount > 0 {
                        Text("\(favoriteCount)")
                            .font(.system(size: 9, weight: .black))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .frame(minWidth: 17, minHeight: 17)
                            .background(DeliveraTheme.orange, in: Capsule())
                            .offset(x: 2, y: -2)
                    }
                }
            }
            .buttonStyle(.plain)
        }
    }
}

enum ActiveOrderSheet: String, Identifiable {
    case info
    case receipt
    case contact

    var id: String { rawValue }
}

private struct TrackingTakeoverTopBar: View {
    let order: ActiveHomeOrder
    let onShowHome: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Din order")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                HStack(spacing: 7) {
                    Circle()
                        .fill(order.status.color)
                        .frame(width: 8, height: 8)
                    Text("\(order.displayStatusTitle) • \(order.restaurantName)")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(1)
                }
            }
            Spacer()
            Button(action: onShowHome) {
                HStack(spacing: 7) {
                    Image(systemName: "square.grid.2x2.fill")
                        .font(.system(size: 12, weight: .black))
                    Text("Visa hem")
                        .font(.system(size: 12, weight: .black))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 13)
                .frame(height: 40)
                .background(DeliveraTheme.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 6)
    }
}

private struct CollapsedTrackingBanner: View {
    let order: ActiveHomeOrder
    let onOpen: () -> Void
    @State private var pulse = false

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(order.status.color.opacity(0.16))
                        .frame(width: 48, height: 48)
                        .scaleEffect(pulse ? 1.08 : 0.94)
                    Image(systemName: order.mode == .delivery ? "bicycle" : "bag.fill")
                        .font(.system(size: 18, weight: .black))
                        .foregroundStyle(order.status.color)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text("Pågående leverans")
                        .font(.system(size: 17, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text("\(order.displayStatusTitle) • \(order.restaurantName) • \(order.etaText)")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(1)
                }
                Spacer()
                Text("Öppna")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .frame(height: 34)
                    .background(order.status.color, in: Capsule())
            }
            .padding(13)
            .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(order.status.color.opacity(0.2), lineWidth: 1))
            .shadow(color: order.status.color.opacity(0.16), radius: 22, y: 10)
        }
        .buttonStyle(.plain)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}

private struct LiveActivityOrderBanner: View {
    let order: ActiveHomeOrder
    let dpointsEarned: Int
    let onOpen: () -> Void
    @State private var pulse = false

    private var modeSymbol: String {
        order.mode == .delivery ? (order.selfDelivery ? "car.side.fill" : "bicycle") : "bag.fill"
    }

    private var eyebrow: String {
        order.mode == .delivery ? "Pågående order" : "Avhämtning"
    }

    private var remainingText: String {
        guard order.status != .delivered else { return "Klar" }
        guard let minutes = Int(order.etaText.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()) else {
            return order.etaText
        }
        let remaining = max(0, Int((Double(minutes) * (1.0 - order.trackingProgress * 0.68)).rounded()))
        return remaining == 0 ? "snart" : "\(remaining) min"
    }

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 13) {
                    ZStack {
                        Circle()
                            .fill(order.status.color.opacity(0.13))
                            .frame(width: 58, height: 58)
                            .scaleEffect(pulse ? 1.05 : 0.98)
                        Circle()
                            .stroke(order.status.color.opacity(0.18), lineWidth: 1)
                            .frame(width: 58, height: 58)
                        Image(systemName: modeSymbol)
                            .font(.system(size: 20, weight: .black))
                            .foregroundStyle(order.status.color)
                    }

                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 7) {
                            Text(eyebrow)
                                .font(.system(size: 10, weight: .black))
                                .foregroundStyle(order.status.color)
                                .textCase(.uppercase)
                            Text(order.displayOrderNumber)
                                .font(.system(size: 10, weight: .black))
                                .foregroundStyle(DeliveraTheme.muted)
                        }
                        Text(order.restaurantName)
                            .font(.system(size: 20, weight: .black, design: .rounded))
                            .foregroundStyle(DeliveraTheme.ink)
                            .lineLimit(1)
                        HStack(spacing: 7) {
                            Text(order.displayStatusTitle)
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 9)
                                .frame(height: 25)
                                .background(order.status.color, in: Capsule())
                            Text(order.status == .delivered ? remainingText : "\(remainingText) kvar")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(DeliveraTheme.ink)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 6)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 42, height: 42)
                        .background(DeliveraTheme.ink, in: Circle())
                }

                HomeOrderMiniProgress(order: order)
            }
            .padding(14)
            .background {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(.white)
                    .overlay(alignment: .topLeading) {
                        Circle()
                            .fill(order.status.color.opacity(0.08))
                            .frame(width: 150, height: 150)
                            .blur(radius: 18)
                            .offset(x: -60, y: -86)
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(order.status.color.opacity(0.16), lineWidth: 1)
            }
            .shadow(color: order.status.color.opacity(0.12), radius: 18, y: 8)
            .shadow(color: .black.opacity(0.06), radius: 12, y: 6)
        }
        .buttonStyle(.plain)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }
}

private struct HomeOrderMiniProgress: View {
    let order: ActiveHomeOrder

    private var status: HomeTrackingStatus { order.status }
    private var progress: Double { order.trackingProgress }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.black.opacity(0.07))
                Capsule()
                    .fill(status.color)
                    .frame(width: max(18, proxy.size.width * progress))
                Circle()
                    .fill(.white)
                    .frame(width: 13, height: 13)
                    .overlay(Circle().stroke(status.color, lineWidth: 4))
                    .offset(x: min(max(0, proxy.size.width * progress - 6.5), max(0, proxy.size.width - 13)))
            }
        }
        .frame(height: 13)
        .animation(.spring(response: 0.58, dampingFraction: 0.82), value: status)
    }
}

private struct TrackingTakeoverView: View {
    let order: ActiveHomeOrder
    let ads: [TrackingAd]
    let trackingError: String?
    let dpointsEarned: Int
    let onShowHome: () -> Void
    let onAction: (ActiveOrderSheet) -> Void
    let onNextStatus: () -> Void
    let onDeleteOrder: () -> Void

    @State private var camera: MapCameraPosition
    @State private var pulse = false
    @State private var routePolyline: MKPolyline?
    @State private var sheetVisible = false
    @State private var animatedDpoints = 0
    @State private var sheetDragY: CGFloat = 0
    @State private var mapReveal = false

    init(
        order: ActiveHomeOrder,
        ads: [TrackingAd],
        trackingError: String?,
        dpointsEarned: Int,
        onShowHome: @escaping () -> Void,
        onAction: @escaping (ActiveOrderSheet) -> Void,
        onNextStatus: @escaping () -> Void,
        onDeleteOrder: @escaping () -> Void
    ) {
        self.order = order
        self.ads = ads
        self.trackingError = trackingError
        self.dpointsEarned = dpointsEarned
        self.onShowHome = onShowHome
        self.onAction = onAction
        self.onNextStatus = onNextStatus
        self.onDeleteOrder = onDeleteOrder
        let center = CLLocationCoordinate2D(
            latitude: (order.restaurantLatitude + order.customerLatitude) / 2,
            longitude: (order.restaurantLongitude + order.customerLongitude) / 2
        )
        _camera = State(initialValue: .region(MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.015, longitudeDelta: 0.015))))
    }

    private var fallbackRouteCoordinates: [CLLocationCoordinate2D] {
        [
            CLLocationCoordinate2D(latitude: order.restaurantLatitude, longitude: order.restaurantLongitude),
            CLLocationCoordinate2D(latitude: order.customerLatitude, longitude: order.customerLongitude)
        ]
    }

    private var routeTaskID: String {
        "\(order.restaurantLatitude)-\(order.restaurantLongitude)-\(order.customerLatitude)-\(order.customerLongitude)-\(order.mode.rawValue)"
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Map(position: $camera, interactionModes: [.pan, .zoom, .rotate, .pitch]) {
                if let routePolyline {
                    MapPolyline(routePolyline)
                        .stroke(order.status.color, style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
                } else {
                    MapPolyline(coordinates: fallbackRouteCoordinates)
                        .stroke(order.status.color, style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
                }
                Annotation(order.restaurantName, coordinate: CLLocationCoordinate2D(latitude: order.restaurantLatitude, longitude: order.restaurantLongitude)) {
                    MapPinBadge(symbol: "fork.knife", color: DeliveraTheme.ink)
                }
                if order.shouldShowCourierLocation {
                    Annotation(order.courierName ?? "Bud", coordinate: CLLocationCoordinate2D(latitude: order.liveCourierLatitude, longitude: order.liveCourierLongitude)) {
                        MapPinBadge(symbol: "bicycle", color: order.status.color, pulsing: pulse)
                    }
                }
                Annotation("Du", coordinate: CLLocationCoordinate2D(latitude: order.customerLatitude, longitude: order.customerLongitude)) {
                    MapPinBadge(symbol: "house.fill", color: .white, foreground: DeliveraTheme.ink)
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .ignoresSafeArea()
            .scaleEffect(mapReveal ? 1 : 1.055)
            .opacity(mapReveal ? 1 : 0.72)
            .animation(.spring(response: 0.55, dampingFraction: 0.84), value: order.status)

            VStack {
                HStack {
                    Button(action: onShowHome) {
                        HStack(spacing: 7) {
                            Image(systemName: "square.grid.2x2.fill")
                            Text("Visa hem")
                        }
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                        .padding(.horizontal, 13)
                        .frame(height: 42)
                        .background(.ultraThinMaterial, in: Capsule())
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    Button {
                        recenterMap()
                    } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                            .frame(width: 42, height: 42)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)

                Spacer()
            }

            TrackingOrderBottomSheet(
                order: order,
                ads: ads,
                trackingError: trackingError,
                animatedDpoints: animatedDpoints,
                dpointsEarned: dpointsEarned,
                onAction: onAction,
                onNextStatus: onNextStatus,
                onDeleteOrder: onDeleteOrder
            )
            .padding(.horizontal, 0)
            .padding(.bottom, 0)
            .frame(maxWidth: .infinity, alignment: .bottom)
            .offset(y: (sheetVisible ? 0 : 90) + sheetDragY)
            .opacity(sheetVisible ? 1 : 0)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        sheetDragY = min(28, max(-92, value.translation.height))
                    }
                    .onEnded { _ in
                        withAnimation(.spring(response: 0.72, dampingFraction: 0.64)) {
                            sheetDragY = 0
                        }
                    }
            )
        }
        .ignoresSafeArea(.container, edges: .bottom)
        .onAppear {
            withAnimation(.easeOut(duration: 0.42)) {
                mapReveal = true
            }
            withAnimation(.spring(response: 0.62, dampingFraction: 0.78).delay(0.08)) {
                sheetVisible = true
            }
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
                pulse = true
            }
            withAnimation(.interpolatingSpring(stiffness: 90, damping: 18).delay(0.22)) {
                animatedDpoints = dpointsEarned
            }
        }
        .onChange(of: dpointsEarned) { _, newValue in
            withAnimation(.interpolatingSpring(stiffness: 90, damping: 18)) {
                animatedDpoints = newValue
            }
        }
        .task(id: routeTaskID) {
            await loadRoute()
        }
    }

    private func recenterMap() {
        if let routePolyline {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                camera = .rect(routePolyline.boundingMapRect.paddedForTracking)
            }
            return
        }
        let center = CLLocationCoordinate2D(
            latitude: (order.restaurantLatitude + order.customerLatitude) / 2,
            longitude: (order.restaurantLongitude + order.customerLongitude) / 2
        )
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
            camera = .region(MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.015, longitudeDelta: 0.015)))
        }
    }

    @MainActor
    private func loadRoute() async {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: order.restaurantLatitude, longitude: order.restaurantLongitude)))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: order.customerLatitude, longitude: order.customerLongitude)))
        request.transportType = order.mode == .pickup ? .walking : .automobile

        do {
            let response = try await MKDirections(request: request).calculate()
            guard let route = response.routes.first else {
                routePolyline = nil
                return
            }
            routePolyline = route.polyline
            withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                camera = .rect(route.polyline.boundingMapRect.paddedForTracking)
            }
        } catch {
            routePolyline = nil
        }
    }
}

private struct TrackingOrderBottomSheet: View {
    let order: ActiveHomeOrder
    let ads: [TrackingAd]
    let trackingError: String?
    let animatedDpoints: Int
    let dpointsEarned: Int
    let onAction: (ActiveOrderSheet) -> Void
    let onNextStatus: () -> Void
    let onDeleteOrder: () -> Void

    private var remainingText: String {
        guard order.status != .delivered else { return "Klar" }
        guard let minutes = Int(order.etaText.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()) else {
            return order.etaText
        }
        let remaining = max(0, Int((Double(minutes) * (1.0 - order.trackingProgress * 0.72)).rounded()))
        return remaining == 0 ? "snart" : "\(remaining) min"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            Capsule()
                .fill(Color.black.opacity(0.16))
                .frame(width: 42, height: 5)
                .frame(maxWidth: .infinity)

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(order.displayStatusTitle)
                        .font(.system(size: 27, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text("\(order.restaurantName) • \(order.etaText)")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.orange)
                        .lineLimit(1)
                    Text(order.status.bodyLine(dpoints: dpointsEarned, mode: order.mode))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(2)
                }
                Spacer()
                VStack(spacing: 1) {
                    Text(remainingText)
                        .font(.system(size: 18, weight: .black, design: .rounded))
                    Text(order.status == .delivered ? "status" : "kvar")
                        .font(.system(size: 9, weight: .black))
                        .opacity(0.72)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .frame(height: 50)
                .background(order.status.color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            TrackingProgressStrip(order: order)

            if let trackingError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 12, weight: .black))
                    Text("Trackingfel: \(trackingError)")
                        .font(.system(size: 11, weight: .black))
                        .lineLimit(3)
                }
                .foregroundStyle(DeliveraTheme.orange)
                .padding(.horizontal, 12)
                .frame(minHeight: 36, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            DpointsEarnedPill(value: animatedDpoints)

            TrackingPlainActions(
                onInfo: { onAction(.info) },
                onReceipt: { onAction(.receipt) },
                onContact: { onAction(.contact) },
                onNextStatus: onNextStatus,
                onDeleteOrder: onDeleteOrder
            )

            TrackingModalAdsRail(ads: ads)
        }
        .padding(18)
        .padding(.bottom, 42)
        .frame(maxWidth: .infinity)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 34, topTrailingRadius: 34, style: .continuous)
                .fill(.ultraThinMaterial)
                .ignoresSafeArea(.container, edges: .bottom)
        }
        .overlay {
            UnevenRoundedRectangle(topLeadingRadius: 34, topTrailingRadius: 34, style: .continuous)
                .stroke(.white.opacity(0.68), lineWidth: 1)
                .ignoresSafeArea(.container, edges: .bottom)
        }
        .shadow(color: .black.opacity(0.24), radius: 34, y: 18)
    }
}

private struct TrackingPlainActions: View {
    let onInfo: () -> Void
    let onReceipt: () -> Void
    let onContact: () -> Void
    let onNextStatus: () -> Void
    let onDeleteOrder: () -> Void

    var body: some View {
        VStack(spacing: 7) {
            HStack(spacing: 0) {
                plainButton("Orderinfo", action: onInfo)
                Divider().frame(height: 18)
                plainButton("Kvitto", action: onReceipt)
                Divider().frame(height: 18)
                plainButton("Kontakt", action: onContact)
            }
            HStack(spacing: 8) {
                actionPill("Byt status", symbol: "arrow.triangle.2.circlepath", destructive: false, action: onNextStatus)
                actionPill("Radera order", symbol: "trash.fill", destructive: true, action: onDeleteOrder)
            }
        }
        .font(.system(size: 12, weight: .black))
        .foregroundStyle(DeliveraTheme.ink)
        .padding(.vertical, 2)
    }

    private func plainButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .frame(height: 30)
        }
        .buttonStyle(.plain)
    }

    private func actionPill(_ title: String, symbol: String, destructive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(destructive ? Color.red : .white)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background(destructive ? Color.red.opacity(0.09) : DeliveraTheme.ink, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct TrackingProgressStrip: View {
    let order: ActiveHomeOrder
    @State private var animatedProgress = 0.0
    @State private var shimmer = false

    private var status: HomeTrackingStatus { order.status }
    private var steps: [HomeTrackingStatus] { order.trackingSteps }
    private var progress: Double { order.trackingProgress }

    private var currentStepIndex: Int {
        steps.firstIndex(of: status) ?? steps.firstIndex(of: .preparing) ?? 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { proxy in
                let width = proxy.size.width
                let fillWidth = max(18, width * animatedProgress)

                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.black.opacity(0.08))

                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [
                                    status.color.opacity(0.76),
                                    status.color,
                                    status.color.opacity(0.88)
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: fillWidth)
                        .shadow(color: status.color.opacity(0.25), radius: 10, y: 4)

                    Capsule()
                        .fill(.white.opacity(0.36))
                        .frame(width: 42, height: 7)
                        .offset(x: shimmer ? max(0, fillWidth - 44) : 4)
                        .opacity(status == .delivered ? 0 : 1)

                    Circle()
                        .fill(.white)
                        .frame(width: 18, height: 18)
                        .overlay(Circle().stroke(status.color, lineWidth: 5))
                        .shadow(color: status.color.opacity(0.24), radius: 10, y: 5)
                        .offset(x: min(max(0, fillWidth - 9), max(0, width - 18)))
                }
            }
            .frame(height: 18)

            HStack {
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    Text(step.shortTitle(for: order.mode))
                        .font(.system(size: 9, weight: index == currentStepIndex ? .black : .bold))
                        .foregroundStyle(index <= currentStepIndex ? status.color : DeliveraTheme.muted.opacity(0.7))
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                        .frame(maxWidth: .infinity, alignment: step == .pending ? .leading : (step == .delivered ? .trailing : .center))
                        .contentTransition(.opacity)
                }
            }
        }
        .onAppear {
            animatedProgress = progress
            withAnimation(.easeInOut(duration: 1.25).repeatForever(autoreverses: true)) {
                shimmer = true
            }
        }
        .onChange(of: status) { _, _ in
            withAnimation(.spring(response: 0.72, dampingFraction: 0.78)) {
                animatedProgress = progress
            }
            shimmer = false
            withAnimation(.easeInOut(duration: 1.25).repeatForever(autoreverses: true)) {
                shimmer = true
            }
        }
    }
}

private extension HomeTrackingStatus {
    func shortTitle(for mode: OrderMode) -> String {
        switch self {
        case .pending: return "Väntar"
        case .accepted: return "Tillagas"
        case .preparing: return "Tillagas"
        case .delivering: return mode == .pickup ? "Redo" : "På väg"
        case .delivered: return mode == .pickup ? "Redo" : "Levererad"
        }
    }
}

private struct DpointsEarnedPill: View {
    let value: Int

    var body: some View {
        HStack(spacing: 10) {
            DpointsGlyph(size: 34)
                .scaleEffect(value > 0 ? 1 : 0.86)
            VStack(alignment: .leading, spacing: 1) {
                Text("+\(value) Dpoints")
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .contentTransition(.numericText())
                Text("tjänas på den här beställningen")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            Spacer()
        }
        .padding(.horizontal, 12)
        .frame(height: 58)
        .background(DeliveraTheme.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct TrackingModalAdsRail: View {
    let ads: [TrackingAd]

    private var visibleAds: [TrackingAd] {
        Array(ads.filter { ($0.imageUrl?.isEmpty == false) || !$0.title.isEmpty }.prefix(5))
    }

    var body: some View {
        if !visibleAds.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 9) {
                    ForEach(visibleAds) { ad in
                        TrackingModalAdTile(ad: ad)
                    }
                }
                .padding(.trailing, 14)
            }
        }
    }
}

private struct TrackingModalAdTile: View {
    let ad: TrackingAd

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let imageUrl = ad.imageUrl, !imageUrl.isEmpty {
                RemoteImage(urlString: imageUrl, contentMode: .fill, showsFailureIcon: false)
            } else {
                LinearGradient(colors: [DeliveraTheme.orange, DeliveraTheme.ink], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
            LinearGradient(colors: [.black.opacity(0.0), .black.opacity(0.64)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 2) {
                Text(ad.title)
                    .font(.system(size: 16, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let subtitle = ad.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white.opacity(0.82))
                        .lineLimit(1)
                }
            }
            .padding(12)
        }
        .frame(width: 236, height: 104)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.14), radius: 12, y: 6)
    }
}

private struct HomeActiveOrderCard: View {
    let order: ActiveHomeOrder
    let onAction: (ActiveOrderSheet) -> Void
    let onNextStatus: () -> Void
    @State private var camera: MapCameraPosition
    @State private var pulse = false
    @State private var routePolyline: MKPolyline?

    init(order: ActiveHomeOrder, onAction: @escaping (ActiveOrderSheet) -> Void, onNextStatus: @escaping () -> Void) {
        self.order = order
        self.onAction = onAction
        self.onNextStatus = onNextStatus
        let center = CLLocationCoordinate2D(
            latitude: (order.restaurantLatitude + order.customerLatitude) / 2,
            longitude: (order.restaurantLongitude + order.customerLongitude) / 2
        )
        _camera = State(initialValue: .region(MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.016, longitudeDelta: 0.016))))
    }

    private var fallbackRouteCoordinates: [CLLocationCoordinate2D] {
        [
            CLLocationCoordinate2D(latitude: order.restaurantLatitude, longitude: order.restaurantLongitude),
            CLLocationCoordinate2D(latitude: order.customerLatitude, longitude: order.customerLongitude)
        ]
    }

    private var routeTaskID: String {
        "\(order.restaurantLatitude)-\(order.restaurantLongitude)-\(order.customerLatitude)-\(order.customerLongitude)-\(order.mode.rawValue)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack(alignment: .bottomLeading) {
                Map(position: $camera, interactionModes: [.pan, .zoom, .rotate, .pitch]) {
                    if let routePolyline {
                        MapPolyline(routePolyline)
                            .stroke(order.status.color, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
                    } else {
                        MapPolyline(coordinates: fallbackRouteCoordinates)
                            .stroke(order.status.color, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
                    }
                    Annotation(order.restaurantName, coordinate: CLLocationCoordinate2D(latitude: order.restaurantLatitude, longitude: order.restaurantLongitude)) {
                        MapPinBadge(symbol: "fork.knife", color: DeliveraTheme.ink)
                    }
                    if order.shouldShowCourierLocation {
                        Annotation(order.courierName ?? "Bud", coordinate: CLLocationCoordinate2D(latitude: order.liveCourierLatitude, longitude: order.liveCourierLongitude)) {
                            MapPinBadge(symbol: "bicycle", color: order.status.color, pulsing: pulse)
                        }
                    }
                    Annotation("Du", coordinate: CLLocationCoordinate2D(latitude: order.customerLatitude, longitude: order.customerLongitude)) {
                        MapPinBadge(symbol: "house.fill", color: .white, foreground: DeliveraTheme.ink)
                    }
                }
                .mapStyle(.standard(elevation: .realistic))
                .frame(height: 292)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .animation(.spring(response: 0.5, dampingFraction: 0.84), value: order.status)

                HStack {
                    Label(order.displayStatusTitle, systemImage: order.mode == .delivery ? "bicycle" : "figure.walk")
                        .font(.system(size: 11, weight: .black))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .frame(height: 31)
                        .background(order.status.color.opacity(0.94), in: Capsule())
                    Spacer()
                    Button {
                        recenterMap()
                    } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                            .frame(width: 38, height: 38)
                            .background(.white.opacity(0.92), in: Circle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(12)
                .frame(maxHeight: .infinity, alignment: .top)
            }

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.displayStatusTitle)
                        .font(.system(size: 20, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(order.displayStatusSubtitle)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(2)
                    Text(order.address)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted.opacity(0.84))
                        .lineLimit(1)
                }
                Spacer()
                VStack(spacing: 1) {
                    Text(order.etaText)
                        .font(.system(size: 17, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                    Text("kvar")
                        .font(.system(size: 9, weight: .black))
                        .foregroundStyle(.white.opacity(0.78))
                }
                .padding(.horizontal, 11)
                .frame(height: 48)
                .background(order.status.color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            HStack(spacing: 10) {
                HomeOrderMiniAction(title: "Orderinfo", symbol: "list.bullet.rectangle") { onAction(.info) }
                HomeOrderMiniAction(title: "Kvitto", symbol: "doc.text.fill") { onAction(.receipt) }
                HomeOrderMiniAction(title: "Kontakt", symbol: "phone.fill") { onAction(.contact) }
                HomeOrderMiniAction(title: "Status", symbol: "arrow.triangle.2.circlepath") { onNextStatus() }
            }
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(.white.opacity(0.8), lineWidth: 1))
        .shadow(color: .black.opacity(0.12), radius: 24, y: 12)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
        .task(id: routeTaskID) {
            await loadRoute()
        }
    }

    private func recenterMap() {
        if let routePolyline {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                camera = .rect(routePolyline.boundingMapRect.paddedForTracking)
            }
            return
        }
        let center = CLLocationCoordinate2D(
            latitude: (order.restaurantLatitude + order.customerLatitude) / 2,
            longitude: (order.restaurantLongitude + order.customerLongitude) / 2
        )
        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
            camera = .region(MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.016, longitudeDelta: 0.016)))
        }
    }

    @MainActor
    private func loadRoute() async {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: order.restaurantLatitude, longitude: order.restaurantLongitude)))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: order.customerLatitude, longitude: order.customerLongitude)))
        request.transportType = order.mode == .pickup ? .walking : .automobile

        do {
            let response = try await MKDirections(request: request).calculate()
            guard let route = response.routes.first else {
                routePolyline = nil
                return
            }
            routePolyline = route.polyline
            withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                camera = .rect(route.polyline.boundingMapRect.paddedForTracking)
            }
        } catch {
            routePolyline = nil
        }
    }
}

private extension MKMapRect {
    var paddedForTracking: MKMapRect {
        let widthPadding = max(size.width * 0.28, 900)
        let heightPadding = max(size.height * 0.42, 1200)
        return insetBy(dx: -widthPadding, dy: -heightPadding)
    }
}

private struct HomeOrderMiniAction: View {
    let title: String
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 12, weight: .black))
                Text(title)
                    .font(.system(size: 11, weight: .black))
            }
            .foregroundStyle(DeliveraTheme.ink)
            .frame(maxWidth: .infinity)
            .frame(height: 42)
            .background(Color.black.opacity(0.045), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct MapPinBadge: View {
    let symbol: String
    let color: Color
    var foreground: Color = .white
    var pulsing = false

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 14, weight: .black))
            .foregroundStyle(foreground)
            .frame(width: 36, height: 36)
            .background(color, in: Circle())
            .overlay {
                if pulsing {
                    Circle()
                        .stroke(color.opacity(0.42), lineWidth: 6)
                        .scaleEffect(1.35)
                }
            }
            .shadow(color: color.opacity(0.35), radius: 12, y: 6)
    }
}

private struct TrackingAdsRail: View {
    let ads: [TrackingAd]
    let loading: Bool

    private var visibleAds: [TrackingAd] {
        Array(ads.filter { ($0.imageUrl?.isEmpty == false) || !$0.title.isEmpty }.prefix(8))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Annonser", subtitle: "Aktuellt i Delivera")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    if loading && visibleAds.isEmpty {
                        ForEach(0..<2, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(.white.opacity(0.8))
                                .frame(width: 330, height: 138)
                                .redacted(reason: .placeholder)
                        }
                    } else {
                        ForEach(visibleAds) { ad in
                            TrackingAdCard(ad: ad)
                        }
                    }
                }
                .padding(.trailing, 20)
            }
        }
    }
}

private struct TrackingAdCard: View {
    let ad: TrackingAd

    var body: some View {
        Button {} label: {
            ZStack(alignment: .bottomLeading) {
                if let imageUrl = ad.imageUrl, !imageUrl.isEmpty {
                    RemoteImage(urlString: imageUrl, contentMode: .fill, showsFailureIcon: false)
                } else {
                    LinearGradient(colors: [DeliveraTheme.orange, DeliveraTheme.ink], startPoint: .topLeading, endPoint: .bottomTrailing)
                }

                if ad.imageOnly != true {
                    LinearGradient(colors: [.black.opacity(0.04), .black.opacity(0.74)], startPoint: .top, endPoint: .bottom)
                    VStack(alignment: .leading, spacing: 7) {
                        Text("ANNONS")
                            .font(.system(size: 10, weight: .black))
                            .foregroundStyle(DeliveraTheme.orange)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(.white.opacity(0.94), in: Capsule())
                        Spacer()
                        Text(ad.title)
                            .font(.system(size: 21, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                        if let subtitle = ad.subtitle, !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white.opacity(0.9))
                                .lineLimit(2)
                        }
                    }
                    .padding(14)
                }
            }
            .frame(width: 330, height: 138)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(.white.opacity(0.45), lineWidth: 1))
            .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
        }
        .buttonStyle(.plain)
    }
}

private struct ActiveOrderSheetView: View {
    let sheet: ActiveOrderSheet
    let order: ActiveHomeOrder
    @Environment(\.openURL) private var openURL
    @State private var platformSettings: PlatformSettings?
    @State private var exportFile: ReceiptExportFile?
    @State private var exportError: String?

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    switch sheet {
                    case .info:
                        infoContent
                    case .receipt:
                        receiptContent
                    case .contact:
                        contactContent
                    }
                }
                .padding(20)
                .padding(.bottom, 24)
            }
        }
        .task {
            platformSettings = try? await DeliveraAPI().settings()
        }
        .sheet(item: $exportFile) { file in
            ShareSheet(activityItems: [file.url])
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text(String(order.restaurantName.prefix(1)).uppercased())
                .font(.system(size: 20, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(order.status.color, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(sheetTitle)
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                Text(order.restaurantName)
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
            }
        }
    }

    private var sheetTitle: String {
        switch sheet {
        case .info: return "Orderinfo"
        case .receipt: return "Kvitto"
        case .contact: return "Kontakta"
        }
    }

    private var infoContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlainTextLine(title: "Status", value: order.displayStatusTitle)
            Divider()
            PlainTextLine(title: "Order", value: order.displayOrderNumber)
            Divider()
            PlainTextLine(title: order.mode == .delivery ? "Leverans" : "Avhämtning", value: order.address)
            Divider()
            PlainTextLine(title: "Tid", value: order.etaText)
            Divider()
            PlainTextLine(title: "Restaurang", value: order.restaurantName)
            if let legal = order.restaurantLegalName, !legal.isEmpty {
                Divider()
                PlainTextLine(title: "Juridiskt namn", value: legal)
            }
            if let org = order.restaurantOrgNumber, !org.isEmpty {
                Divider()
                PlainTextLine(title: "Org.nr", value: org)
            }
            if let address = order.restaurantAddress, !address.isEmpty {
                Divider()
                PlainTextLine(title: "Adress", value: address)
            }
            Divider()
            PlainTextLine(title: "Moms", value: "\(formatNumber(order.restaurantVatPercent))%")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .background(.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }

    private var receiptContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(order.restaurantName)
                    .font(.system(size: 18, weight: .black, design: .rounded))
                Text(order.displayOrderNumber)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
                if let legal = order.restaurantLegalName, !legal.isEmpty {
                    Text(legal)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
                if let org = order.restaurantOrgNumber, !org.isEmpty {
                    Text("Org.nr \(org)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
            }
            Divider()

            ForEach(order.items) { item in
                VStack(alignment: .leading, spacing: 3) {
                    ReceiptLine(title: "\(item.quantity)x \(item.name)", value: priceText(item.total))
                    if !item.extras.isEmpty {
                        Text(item.extras.joined(separator: ", "))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                            .lineLimit(2)
                    }
                }
            }

            Divider()
            ReceiptLine(title: "Delsumma", value: priceText(order.subtotal))
            ReceiptLine(title: order.mode == .pickup ? "Avhämtning" : "Leverans", value: order.deliveryFee > 0 ? priceText(order.deliveryFee) : "Fri")
            if order.discountAmount > 0 {
                ReceiptLine(title: "Rabatt", value: "-\(priceText(order.discountAmount))", accent: .green)
            }
            ReceiptLine(title: "Varav moms \(formatNumber(order.restaurantVatPercent))%", value: priceText(order.vatAmount))
            Divider()
            HStack {
                Text("Totalt")
                Spacer()
                Text(priceText(order.total))
            }
            .font(.system(size: 21, weight: .black, design: .rounded))
            .foregroundStyle(DeliveraTheme.ink)

            VStack(alignment: .leading, spacing: 3) {
                Text("Säljare")
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
                Text([platformSettings?.companyName, platformSettings?.organizationNumber].compactMap { $0 }.joined(separator: " • "))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(DeliveraTheme.ink)
                if let address = platformSettings?.companyAddress, !address.isEmpty {
                    Text(address)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
            }

            Button {
                do {
                    exportFile = try makeReceiptPDF(order: order, settings: platformSettings)
                    exportError = nil
                } catch {
                    exportError = error.localizedDescription
                }
            } label: {
                HStack {
                    Text("Ladda ner kvitto som PDF")
                    Spacer()
                    Image(systemName: "arrow.down.doc.fill")
                }
                .font(.system(size: 14, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 15)
                .frame(height: 50)
                .background(DeliveraTheme.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)

            if let exportError {
                Text(exportError)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.red)
            }
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }

    private var contactContent: some View {
        VStack(spacing: 0) {
            Button {
                callRestaurant()
            } label: {
                ContactAction(
                    title: "Ring restaurang",
                    subtitle: order.restaurantPhone?.isEmpty == false ? (order.restaurantPhone ?? "") : "Telefon saknas",
                    symbol: "phone.fill",
                    isDisabled: order.restaurantPhone?.isEmpty != false
                )
            }
            .buttonStyle(.plain)
            .disabled(order.restaurantPhone?.isEmpty != false)
            Divider().padding(.leading, 58)
            Button {} label: {
                ContactAction(title: "Kontakta support", subtitle: "Vi hjälper dig med ordern", symbol: "bubble.left.and.bubble.right.fill")
            }
            .buttonStyle(.plain)
            Divider().padding(.leading, 58)
            Button {} label: {
                ContactAction(title: "Visa orderhjälp", subtitle: "Problem med betalning eller leverans", symbol: "questionmark.circle.fill")
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
        .background(.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }

    private func callRestaurant() {
        guard let phone = order.restaurantPhone, !phone.isEmpty else { return }
        let allowed = CharacterSet(charactersIn: "+0123456789")
        let normalized = phone.unicodeScalars.filter { allowed.contains($0) }.map(String.init).joined()
        guard !normalized.isEmpty, let url = URL(string: "tel://\(normalized)") else { return }
        openURL(url)
    }
}

private struct PlainInfoLine: View {
    let title: String
    let value: String
    let symbol: String
    let tint: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .black))
                .foregroundStyle(tint)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
                Text(value)
                    .font(.system(size: 15, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(.vertical, 12)
    }
}

private struct PlainTextLine: View {
    let title: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(DeliveraTheme.muted)
                .frame(width: 118, alignment: .leading)
            Text(value.isEmpty ? "-" : value)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(DeliveraTheme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 11)
    }
}

private struct ReceiptLine: View {
    let title: String
    let value: String
    var accent: Color? = nil

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(DeliveraTheme.muted)
            Spacer()
            Text(value)
                .font(.system(size: 15, weight: .black, design: .rounded))
                .foregroundStyle(accent ?? DeliveraTheme.ink)
        }
    }
}

private struct ReceiptExportFile: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private func formatNumber(_ value: Double) -> String {
    if value.rounded() == value {
        return "\(Int(value))"
    }
    return String(format: "%.1f", value).replacingOccurrences(of: ".", with: ",")
}

private func makeReceiptPDF(order: ActiveHomeOrder, settings: PlatformSettings?) throws -> ReceiptExportFile {
    let fileName = "delivera-kvitto-\(order.displayOrderNumber.replacingOccurrences(of: "#", with: "")).pdf"
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
    let page = CGRect(x: 0, y: 0, width: 595, height: 842)
    let renderer = UIGraphicsPDFRenderer(bounds: page)

    let data = renderer.pdfData { context in
        context.beginPage()
        var y: CGFloat = 44
        let left: CGFloat = 44
        let right: CGFloat = page.width - 44

        func draw(_ text: String, size: CGFloat = 12, weight: UIFont.Weight = .regular, color: UIColor = .black, yStep: CGFloat = 18) {
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: size, weight: weight),
                .foregroundColor: color
            ]
            text.draw(in: CGRect(x: left, y: y, width: right - left, height: yStep + 8), withAttributes: attrs)
            y += yStep
        }

        func row(_ title: String, _ value: String, bold: Bool = false) {
            let attrsLeft: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: bold ? 14 : 12, weight: bold ? .bold : .regular),
                .foregroundColor: UIColor.black
            ]
            let attrsRight: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: bold ? 15 : 12, weight: bold ? .bold : .semibold),
                .foregroundColor: UIColor.black
            ]
            title.draw(in: CGRect(x: left, y: y, width: 310, height: 22), withAttributes: attrsLeft)
            value.draw(in: CGRect(x: right - 160, y: y, width: 160, height: 22), withAttributes: attrsRight)
            y += bold ? 24 : 20
        }

        func divider() {
            let path = UIBezierPath()
            path.move(to: CGPoint(x: left, y: y))
            path.addLine(to: CGPoint(x: right, y: y))
            UIColor(white: 0.86, alpha: 1).setStroke()
            path.lineWidth = 1
            path.stroke()
            y += 16
        }

        draw("Delivera kvitto", size: 26, weight: .black, yStep: 34)
        draw(order.restaurantName, size: 17, weight: .bold, yStep: 22)
        draw("Order \(order.displayOrderNumber)", size: 11, weight: .semibold, color: .darkGray, yStep: 18)
        divider()

        if let legal = order.restaurantLegalName, !legal.isEmpty { draw(legal, size: 12, weight: .semibold) }
        if let org = order.restaurantOrgNumber, !org.isEmpty { draw("Restaurang org.nr \(org)", size: 12, color: .darkGray) }
        if let address = order.restaurantAddress, !address.isEmpty { draw(address, size: 12, color: .darkGray) }
        divider()

        for item in order.items {
            row("\(item.quantity)x \(item.name)", priceText(item.total))
            if !item.extras.isEmpty {
                draw(item.extras.joined(separator: ", "), size: 10, color: .darkGray, yStep: 14)
            }
        }

        divider()
        row("Delsumma", priceText(order.subtotal))
        row(order.mode == .pickup ? "Avhämtning" : "Leverans", order.deliveryFee > 0 ? priceText(order.deliveryFee) : "Fri")
        if order.discountAmount > 0 {
            row("Rabatt", "-\(priceText(order.discountAmount))")
        }
        row("Varav moms \(formatNumber(order.restaurantVatPercent))%", priceText(order.vatAmount))
        divider()
        row("Totalt", priceText(order.total), bold: true)
        y += 18

        draw("Säljare", size: 11, weight: .bold, color: .darkGray, yStep: 15)
        draw(settings?.companyName ?? "Delivera", size: 12, weight: .semibold)
        if let org = settings?.organizationNumber, !org.isEmpty { draw("Org.nr \(org)", size: 12, color: .darkGray) }
        if let address = settings?.companyAddress, !address.isEmpty { draw(address, size: 12, color: .darkGray) }
    }

    try data.write(to: url, options: .atomic)
    return ReceiptExportFile(url: url)
}

private struct ContactAction: View {
    let title: String
    let subtitle: String
    let symbol: String
    var isDisabled: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(isDisabled ? DeliveraTheme.muted.opacity(0.45) : DeliveraTheme.ink, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .black, design: .rounded))
                Text(subtitle)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .black))
        }
        .foregroundStyle(isDisabled ? DeliveraTheme.muted : DeliveraTheme.ink)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }
}

private struct ComingSoonTabView: View {
    let title: String

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()
            VStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                Text("Kommer snart")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            .padding(.bottom, 90)
        }
    }
}

private struct HomeEntranceModifier: ViewModifier {
    let seed: Int
    let direction: CGFloat
    let delay: Double
    @State private var visible = false

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(x: visible ? 0 : direction * 54, y: 0)
            .onAppear { run() }
            .onChange(of: seed) { _, _ in run() }
    }

    private func run() {
        visible = false
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(.spring(response: 0.54, dampingFraction: 0.86)) {
                visible = true
            }
        }
    }
}

private extension View {
    func homeEntrance(seed: Int, direction: CGFloat, delay: Double) -> some View {
        modifier(HomeEntranceModifier(seed: seed, direction: direction, delay: delay))
    }
}

private struct FavoritesSheetView: View {
    let restaurants: [Restaurant]
    let onOpen: (Restaurant) -> Void
    let onToggleFavorite: (Restaurant) -> Void

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Favoriter")
                            .font(.system(size: 32, weight: .black, design: .rounded))
                            .foregroundStyle(DeliveraTheme.ink)
                        Text(restaurants.isEmpty ? "Dina sparade restauranger visas här." : "\(restaurants.count) sparade restauranger")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                    }

                    if restaurants.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "heart")
                                .font(.system(size: 34, weight: .black))
                                .foregroundStyle(DeliveraTheme.orange)
                                .frame(width: 74, height: 74)
                                .background(.white, in: Circle())
                                .shadow(color: DeliveraTheme.orange.opacity(0.18), radius: 18, y: 8)
                            Text("Inga favoriter ännu")
                                .font(.system(size: 22, weight: .black, design: .rounded))
                                .foregroundStyle(DeliveraTheme.ink)
                            Text("Tryck på hjärtat på en restaurang så hamnar den här.")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 34)
                    } else {
                        ForEach(restaurants) { restaurant in
                            Button {
                                onOpen(restaurant)
                            } label: {
                                HStack(spacing: 12) {
                                    if restaurant.hasImage {
                                        RemoteImage(urlString: restaurant.heroImageUrl ?? restaurant.imageUrl, contentMode: .fill, showsFailureIcon: false)
                                            .frame(width: 66, height: 66)
                                            .background(.white)
                                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    } else {
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .fill(.white)
                                            .frame(width: 66, height: 66)
                                    }
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(restaurant.name)
                                            .font(.system(size: 16, weight: .black, design: .rounded))
                                            .foregroundStyle(DeliveraTheme.ink)
                                            .lineLimit(1)
                                        Text(restaurant.cuisine?.capitalized ?? restaurant.city ?? "Restaurang")
                                            .font(.system(size: 12, weight: .bold))
                                            .foregroundStyle(DeliveraTheme.muted)
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                    Button {
                                        onToggleFavorite(restaurant)
                                    } label: {
                                        Image(systemName: "heart.fill")
                                            .font(.system(size: 15, weight: .black))
                                            .foregroundStyle(DeliveraTheme.orange)
                                            .frame(width: 38, height: 38)
                                            .background(DeliveraTheme.orange.opacity(0.1), in: Circle())
                                    }
                                    .buttonStyle(.plain)
                                }
                                .padding(12)
                                .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(20)
                .padding(.bottom, 28)
            }
        }
    }
}

private struct FloatingBottomNav: View {
    @Binding var selected: HomeTab
    let cartCount: Int
    @Namespace private var navNamespace
    @State private var isDragging = false

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 4) {
                ForEach(HomeTab.allCases) { tab in
                    Button {
                        selected = tab
                    } label: {
                        VStack(spacing: 4) {
                            ZStack(alignment: .topTrailing) {
                                Image(systemName: tab.symbol)
                                    .font(.system(size: selected == tab && isDragging ? 21 : 17, weight: .bold))
                                if tab == .cart, cartCount > 0 {
                                    Text(cartCount > 99 ? "99+" : "\(cartCount)")
                                        .font(.system(size: 9, weight: .black))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 5)
                                        .frame(minWidth: 17, minHeight: 17)
                                        .background(DeliveraTheme.orange, in: Capsule())
                                        .offset(x: 12, y: -9)
                                }
                            }
                            Text(tab.title)
                                .font(.system(size: 10, weight: .black))
                        }
                        .scaleEffect(selected == tab && isDragging ? 1.06 : 1)
                        .foregroundStyle(selected == tab ? DeliveraTheme.orange : DeliveraTheme.ink.opacity(0.52))
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background {
                            if selected == tab {
                                RoundedRectangle(cornerRadius: 21, style: .continuous)
                                    .fill(.white.opacity(0.92))
                                    .matchedGeometryEffect(id: "selectedTab", in: navNamespace)
                                    .shadow(color: DeliveraTheme.orange.opacity(0.16), radius: 12, y: 5)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(6)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(.white.opacity(0.64), lineWidth: 1))
            .shadow(color: .black.opacity(0.18), radius: 22, y: 10)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isDragging = true
                        withAnimation(.interactiveSpring(response: 0.24, dampingFraction: 0.76)) {
                            selectTab(at: value.location.x, width: proxy.size.width)
                        }
                    }
                    .onEnded { value in
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.72)) {
                            selectTab(at: value.predictedEndLocation.x, width: proxy.size.width)
                        }
                        isDragging = false
                    }
            )
        }
        .frame(height: 68)
    }

    private func selectTab(at x: CGFloat, width: CGFloat) {
        let tabs = HomeTab.allCases
        guard width > 0, !tabs.isEmpty else { return }
        let clamped = min(max(x, 0), width - 0.1)
        let index = min(tabs.count - 1, max(0, Int((clamped / width) * CGFloat(tabs.count))))
        selected = tabs[index]
    }
}
