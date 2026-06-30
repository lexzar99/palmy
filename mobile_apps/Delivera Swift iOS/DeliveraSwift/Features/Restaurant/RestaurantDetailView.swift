import SwiftUI
import UIKit

struct RestaurantDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @StateObject private var model: RestaurantDetailViewModel
    @ObservedObject var cartStore: CartStore
    @State private var selectedProduct: MenuProduct?
    @State private var pendingCartAdd: PendingCartAdd?
    @State private var showingReplaceCartAlert = false
    @State private var showingReviews = false
    @State private var showingInfo = false
    @State private var isMenuHeaderPinned = false
    @State private var stickyBlurProgress: CGFloat = 0
    @State private var heroRevealed = false
    let orderMode: OrderMode
    let deliveryCoordinate: Coordinate?
    let activeAddress: String
    let isFavorite: Bool
    let onOpenCart: () -> Void
    let onToggleFavorite: () -> Void
    private var heroHeight: CGFloat { 292 }

    init(
        restaurant: Restaurant,
        orderMode: OrderMode,
        deliveryCoordinate: Coordinate?,
        activeAddress: String,
        cartStore: CartStore,
        isFavorite: Bool,
        onOpenCart: @escaping () -> Void,
        onToggleFavorite: @escaping () -> Void
    ) {
        _model = StateObject(wrappedValue: RestaurantDetailViewModel(restaurant: restaurant))
        self.cartStore = cartStore
        self.orderMode = orderMode
        self.deliveryCoordinate = deliveryCoordinate
        self.activeAddress = activeAddress
        self.isFavorite = isFavorite
        self.onOpenCart = onOpenCart
        self.onToggleFavorite = onToggleFavorite
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottom) {
                DeliveraTheme.appBackground.ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        hero
                        content
                    }
                    .frame(width: proxy.size.width, alignment: .top)
                    .padding(.bottom, cartStore.count > 0 ? 104 : 28)
                }
                .frame(width: proxy.size.width)

                if cartStore.count > 0 {
                    cartBar
                        .padding(.horizontal, 18)
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .background(SwipeBackEnabler())
        .task {
            heroRevealed = false
            await model.load(orderMode: orderMode, deliveryCoordinate: deliveryCoordinate)
            withAnimation(.spring(response: 0.82, dampingFraction: 0.88)) {
                heroRevealed = true
            }
            cartStore.configure(
                restaurant: model.restaurant,
                orderMode: orderMode,
                address: activeAddress,
                deliveryFee: orderMode == .pickup || !model.zoneValidationFinished ? 0 : model.displayDeliveryFee,
                deliveryCoordinate: deliveryCoordinate,
                categories: model.categories
            )
        }
        .navigationDestination(isPresented: $showingReviews) {
            RestaurantReviewsView(restaurant: model.restaurant)
        }
        .sheet(item: $selectedProduct) { product in
            ProductQuickView(
                product: product,
                restaurantIsOrderingEnabled: model.orderingEnabled,
                onAdd: { extras, quantity, paidWithPoints, dpointsUnitCost in
                    requestCartAdd(
                        product: product,
                        extras: extras,
                        quantity: quantity,
                        paidWithPoints: paidWithPoints,
                        dpointsUnitCost: dpointsUnitCost
                    )
                }
            )
            .presentationDetents([.fraction(0.92), .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingInfo) {
            RestaurantInfoSheet(restaurant: model.restaurant)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .alert("Töm varukorgen från föregående restaurang?", isPresented: $showingReplaceCartAlert) {
            Button("Nej", role: .cancel) {
                pendingCartAdd = nil
            }
            Button("Ja", role: .destructive) {
                guard let pendingCartAdd else { return }
                cartStore.replaceCartContext(
                    restaurant: model.restaurant,
                    orderMode: orderMode,
                    address: activeAddress,
                    deliveryFee: orderMode == .pickup || !model.zoneValidationFinished ? 0 : model.displayDeliveryFee,
                    deliveryCoordinate: deliveryCoordinate,
                    categories: model.categories
                )
                cartStore.add(
                    product: pendingCartAdd.product,
                    extras: pendingCartAdd.extras,
                    quantity: pendingCartAdd.quantity,
                    paidWithPoints: pendingCartAdd.paidWithPoints,
                    dpointsUnitCost: pendingCartAdd.dpointsUnitCost
                )
                self.pendingCartAdd = nil
                selectedProduct = nil
            }
        } message: {
            Text("Du har redan artiklar från \(cartStore.restaurant?.name ?? "en annan restaurang"). Vill du tömma den och börja från \(model.restaurant.name)?")
        }
    }

    private var hero: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Group {
                    if model.restaurant.hasImage {
                        RemoteImage(urlString: model.restaurant.heroImageUrl ?? model.restaurant.imageUrl, showsFailureIcon: false)
                    } else {
                        Rectangle().fill(.white)
                    }
                }
                .frame(width: proxy.size.width, height: proxy.size.height)
                .clipped()
                .scaleEffect(heroRevealed ? 1 : 1.06)
                .opacity(heroRevealed ? 1 : 0.78)
                .overlay(alignment: .bottom) {
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.76)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 172)
                }
                .overlay {
                    RestaurantHeroRevealPattern(active: !heroRevealed)
                }

                HStack {
                    CircleIconButton(symbol: "chevron.left") {
                        dismiss()
                    }
                    Spacer()
                    if let phone = model.restaurant.phone, !phone.isEmpty {
                        CircleIconButton(symbol: "phone.fill") {
                            call(phone)
                        }
                    }
                    CircleIconButton(symbol: "info") {
                        showingInfo = true
                    }
                    CircleIconButton(symbol: isFavorite ? "heart.fill" : "heart") {
                        onToggleFavorite()
                    }
                    CircleIconButton(symbol: "square.and.arrow.up") {}
                }
                .padding(.horizontal, 20)
                .padding(.top, topSafeAreaInset + 12)

                VStack(alignment: .leading, spacing: 10) {
                    if let status = RestaurantAvailability.statusLabel(for: model.restaurant) {
                        Label(status, systemImage: model.restaurant.comingSoon == true ? "sparkles" : "moon.fill")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(.black.opacity(0.78), in: Capsule())
                    }

                    Text(model.restaurant.name)
                        .font(.system(size: 33, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.78)
                        .allowsTightening(true)
                        .frame(width: max(220, proxy.size.width - 56), alignment: .leading)

                    Button {
                        showingReviews = true
                    } label: {
                        HStack(spacing: 7) {
                            Image(systemName: "star.fill")
                                .foregroundStyle(DeliveraTheme.gold)
                            Text(String(format: "%.1f", model.restaurant.rating ?? 4.6))
                                .font(.system(size: 14, weight: .black))
                            Text("(\(model.restaurant.ratingCount ?? 0))")
                                .font(.system(size: 13, weight: .bold))
                                .opacity(0.82)
                            if let cuisine = model.restaurant.cuisine, !cuisine.isEmpty {
                                Text("· \(cuisine.capitalized)")
                                    .lineLimit(1)
                            }
                        }
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 20)
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .bottomLeading)
            }
        }
        .padding(.top, -topSafeAreaInset)
        .frame(height: heroHeight + topSafeAreaInset)
        .ignoresSafeArea(edges: .top)
        .clipped()
    }

    private var content: some View {
        LazyVStack(alignment: .leading, spacing: 12, pinnedViews: [.sectionHeaders]) {
            metrics

            if model.zoneAvailable == false, orderMode == .delivery {
                NoDeliveryBanner()
            }

            if let description = model.restaurant.description, !description.isEmpty {
                Text(description)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(DeliveraTheme.muted)
                    .lineSpacing(3)
            }

            Section {
                if model.isLoading {
                    menuSkeleton
                } else if let error = model.errorMessage {
                    NoticeBanner(text: error)
                } else if model.categories.isEmpty {
                    EmptyMenuView()
                } else {
                    menuSections
                }
            } header: {
                stickyMenuHeader
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 6)
        .padding(.bottom, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DeliveraTheme.appBackground)
        .onPreferenceChange(MenuHeaderYPreferenceKey.self) { y in
            let fullPinY = topSafeAreaInset + 2
            let fadeStartY = fullPinY + 82
            let rawProgress = (fadeStartY - y) / max(1, fadeStartY - fullPinY)
            let progress = min(1, max(0, rawProgress))
            let pinned = progress >= 0.98
            if pinned != isMenuHeaderPinned {
                withAnimation(.easeOut(duration: 0.18)) {
                    isMenuHeaderPinned = pinned
                }
            }
            if abs(progress - stickyBlurProgress) > 0.01 {
                withAnimation(.easeOut(duration: 0.14)) {
                    stickyBlurProgress = progress
                }
            }
        }
    }

    private var metrics: some View {
        HStack(spacing: 7) {
            DetailMetric(symbol: "clock.fill", value: "~\(model.displayEtaMinutes) min", label: orderMode == .delivery ? "Tid" : "Avhämtning")
            DetailMetric(symbol: orderMode.systemImage, value: deliveryFeeText, label: "Avgift")
            DetailMetric(symbol: "bag.fill", value: minOrderText, label: "Minorder")
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(DeliveraTheme.orange)
            TextField("Sök i menyn", text: $model.searchQuery)
                .font(.system(size: 15, weight: .bold))
                .textInputAutocapitalization(.never)
            if !model.searchQuery.isEmpty {
                Button {
                    model.searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(DeliveraTheme.muted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 52)
        .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }

    private var stickyMenuHeader: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                CircleIconButton(symbol: "chevron.left") {
                    dismiss()
                }
                searchField
            }

            if !model.categories.isEmpty {
                categoryRail
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 8 * stickyBlurProgress)
        .padding(.bottom, 6 + (4 * stickyBlurProgress))
        .background {
            GeometryReader { proxy in
                ZStack(alignment: .top) {
                    Rectangle()
                        .fill(.regularMaterial)
                        .frame(height: proxy.size.height + topSafeAreaInset + 18)
                        .offset(y: -topSafeAreaInset - 18)
                    Rectangle()
                        .fill(Color.white.opacity(isMenuHeaderPinned ? 0.34 : 0.18))
                        .frame(height: proxy.size.height + topSafeAreaInset + 18)
                        .offset(y: -topSafeAreaInset - 18)
                }
                .ignoresSafeArea(edges: .top)
            }
            .opacity(stickyBlurProgress)
        }
        .shadow(color: .black.opacity(0.14 * stickyBlurProgress), radius: 20 * stickyBlurProgress, y: 10 * stickyBlurProgress)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(DeliveraTheme.line.opacity(stickyBlurProgress))
                .frame(height: 1)
        }
        .padding(.horizontal, -24)
        .zIndex(10)
        .background {
            GeometryReader { proxy in
                Color.clear.preference(key: MenuHeaderYPreferenceKey.self, value: proxy.frame(in: .global).minY)
            }
        }
    }

    private var categoryRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button {
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                        model.selectedCategoryID = nil
                    }
                } label: {
                    Text("Alla")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(model.selectedCategoryID == nil ? .white : DeliveraTheme.ink)
                        .lineLimit(1)
                        .padding(.horizontal, 13)
                        .frame(height: 38)
                        .background(model.selectedCategoryID == nil ? DeliveraTheme.orange : Color.white, in: Capsule())
                        .overlay(Capsule().stroke(DeliveraTheme.line, lineWidth: 1))
                }
                .buttonStyle(.plain)

                ForEach(model.categories) { category in
                    Button {
                        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                            model.selectedCategoryID = category.id
                        }
                    } label: {
                        Text(category.name)
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(model.selectedCategoryID == category.id ? .white : DeliveraTheme.ink)
                            .lineLimit(1)
                            .padding(.horizontal, 13)
                            .frame(height: 38)
                            .background(model.selectedCategoryID == category.id ? DeliveraTheme.orange : Color.white, in: Capsule())
                            .overlay(Capsule().stroke(DeliveraTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.trailing, 20)
        }
    }

    private var menuSections: some View {
        LazyVStack(alignment: .leading, spacing: 20) {
            ForEach(model.visibleCategories) { category in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(category.name)
                            .font(.system(size: 24, weight: .black, design: .rounded))
                            .foregroundStyle(DeliveraTheme.ink)
                        Spacer()
                        Text("\(category.products.count)")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(DeliveraTheme.muted)
                    }

                    ForEach(category.products) { product in
                        if product.displayMode != "COMPACT" {
                            ProductRow(
                                product: product,
                                orderingEnabled: model.orderingEnabled,
                                onTap: { selectedProduct = product },
                                onAdd: { addOrConfigure(product) }
                            )
                        }
                    }

                    let compactProducts = category.products.filter { $0.displayMode == "COMPACT" }
                    if !compactProducts.isEmpty {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                            ForEach(compactProducts) { product in
                                ProductCompactCard(
                                    product: product,
                                    orderingEnabled: model.orderingEnabled,
                                    onTap: { selectedProduct = product },
                                    onAdd: { addOrConfigure(product) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    private var menuSkeleton: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(0..<5, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.white.opacity(0.75))
                    .frame(height: 112)
                    .redacted(reason: .placeholder)
            }
        }
    }

    private var cartBar: some View {
        Button(action: onOpenCart) {
            HStack(spacing: 12) {
                Text("\(cartStore.count)")
                    .font(.system(size: 14, weight: .black))
                    .foregroundStyle(DeliveraTheme.orange)
                    .frame(width: 32, height: 32)
                    .background(.white, in: Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text("Varukorg")
                        .font(.system(size: 15, weight: .black))
                    Text(priceText(cartStore.total))
                        .font(.system(size: 12, weight: .bold))
                        .opacity(0.8)
                }

                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .black))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(height: 64)
            .background(DeliveraTheme.ink, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.24), radius: 24, y: 12)
        }
        .buttonStyle(.plain)
    }

    private var topSafeAreaInset: CGFloat {
        let topInset = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow?.safeAreaInsets.top }
            .first ?? 0
        return max(0, topInset)
    }

    private var deliveryFeeText: String {
        if orderMode == .pickup { return "0 kr" }
        guard model.zoneValidationFinished else { return "-" }
        guard model.zoneAvailable != false else { return "-" }
        let fee = model.displayDeliveryFee
        return fee <= 0 ? "Gratis" : "\(Int(fee)) kr"
    }

    private var minOrderText: String {
        if orderMode == .pickup { return "0 kr" }
        guard model.zoneValidationFinished else { return "-" }
        return priceText(model.displayMinOrderAmount)
    }

    private func addOrConfigure(_ product: MenuProduct) {
        if product.requiresConfiguration {
            selectedProduct = product
        } else {
            requestCartAdd(product: product)
        }
    }

    private func requestCartAdd(
        product: MenuProduct,
        extras: [SelectedExtra] = [],
        quantity: Int = 1,
        paidWithPoints: Bool = false,
        dpointsUnitCost: Int? = nil
    ) {
        if cartStore.requiresRestaurantSwitch(to: model.restaurant) {
            pendingCartAdd = PendingCartAdd(
                product: product,
                extras: extras,
                quantity: quantity,
                paidWithPoints: paidWithPoints,
                dpointsUnitCost: dpointsUnitCost
            )
            showingReplaceCartAlert = true
            return
        }

        cartStore.configure(
            restaurant: model.restaurant,
            orderMode: orderMode,
            address: activeAddress,
            deliveryFee: orderMode == .pickup || !model.zoneValidationFinished ? 0 : model.displayDeliveryFee,
            deliveryCoordinate: deliveryCoordinate,
            categories: model.categories
        )
        cartStore.add(
            product: product,
            extras: extras,
            quantity: quantity,
            paidWithPoints: paidWithPoints,
            dpointsUnitCost: dpointsUnitCost
        )
        selectedProduct = nil
    }

    private func call(_ phone: String) {
        let normalized = phone.filter { $0.isNumber || $0 == "+" }
        guard let url = URL(string: "tel://\(normalized)") else { return }
        openURL(url)
    }
}

private struct PendingCartAdd {
    let product: MenuProduct
    let extras: [SelectedExtra]
    let quantity: Int
    let paidWithPoints: Bool
    let dpointsUnitCost: Int?
}

private struct DetailMetric: View {
    let symbol: String
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(DeliveraTheme.orange)
            Text(value)
                .font(.system(size: 14, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(DeliveraTheme.muted)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(height: 78)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct ProductRow: View {
    let product: MenuProduct
    let orderingEnabled: Bool
    let onTap: () -> Void
    let onAdd: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 7) {
                        Text(product.name)
                            .font(.system(size: 16, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                            .lineLimit(2)

                        if product.discountActive == true {
                            Text("Deal")
                                .font(.system(size: 10, weight: .black))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 7)
                                .frame(height: 20)
                                .background(DeliveraTheme.orange, in: Capsule())
                        }
                    }

                    if product.hideDescription != true, let description = product.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(DeliveraTheme.muted)
                            .lineLimit(2)
                            .lineSpacing(2)
                    }

                    HStack(spacing: 8) {
                        Text(priceText(product.effectivePrice))
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                        if product.discountActive == true {
                            Text(priceText(product.price))
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                                .strikethrough()
                        }
                        DpointsPriceBadge(product: product)
                    }
                }

                Spacer(minLength: 8)

                ZStack(alignment: .bottomTrailing) {
                    if product.hasImage {
                        RemoteImage(urlString: product.imageUrl, contentMode: .fit, showsFailureIcon: false)
                            .frame(width: 92, height: 92)
                            .background(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                    }

                    Button(action: onAdd) {
                        Image(systemName: "plus")
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(orderingEnabled ? .white : DeliveraTheme.muted)
                            .frame(width: 32, height: 32)
                            .background(orderingEnabled ? DeliveraTheme.orange : Color.white.opacity(0.9), in: Circle())
                            .shadow(color: .black.opacity(0.16), radius: 10, y: 4)
                    }
                    .buttonStyle(.plain)
                    .disabled(!orderingEnabled)
                    .padding(6)
                }
            }
            .padding(12)
            .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct ProductCompactCard: View {
    let product: MenuProduct
    let orderingEnabled: Bool
    let onTap: () -> Void
    let onAdd: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 9) {
                ZStack(alignment: .bottomTrailing) {
                    if product.hasImage {
                        RemoteImage(urlString: product.imageUrl, contentMode: .fit, showsFailureIcon: false)
                            .frame(height: 118)
                            .frame(maxWidth: .infinity)
                            .background(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                    } else {
                        Color.clear
                            .frame(height: 8)
                            .frame(maxWidth: .infinity)
                    }

                    Button(action: onAdd) {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(orderingEnabled ? .white : DeliveraTheme.muted)
                            .frame(width: 30, height: 30)
                            .background(orderingEnabled ? DeliveraTheme.orange : Color.white.opacity(0.9), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!orderingEnabled)
                    .padding(7)
                }

                Text(product.name)
                    .font(.system(size: 14, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                if product.hideDescription != true, let description = product.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 6) {
                    Text(priceText(product.effectivePrice))
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                    if product.discountActive == true {
                        Text(priceText(product.price))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                            .strikethrough()
                    }
                    DpointsPriceBadge(product: product)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct NoDeliveryBanner: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 18, weight: .black))
            VStack(alignment: .leading, spacing: 2) {
                Text("Restaurangen levererar inte hit")
                    .font(.system(size: 14, weight: .black))
                Text("Byt adress eller välj avhämtning om restaurangen erbjuder det.")
                    .font(.system(size: 12, weight: .semibold))
                    .opacity(0.82)
            }
            Spacer()
        }
        .foregroundStyle(Color(red: 0.72, green: 0.07, blue: 0.18))
        .padding(14)
        .background(Color(red: 0.98, green: 0.90, blue: 0.91), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color(red: 0.72, green: 0.07, blue: 0.18).opacity(0.2), lineWidth: 1))
    }
}

private struct RestaurantInfoSheet: View {
    let restaurant: Restaurant

    var body: some View {
        NavigationStack {
            ZStack {
                DeliveraTheme.appBackground.ignoresSafeArea()
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Restauranginfo")
                                .font(.system(size: 30, weight: .black, design: .rounded))
                                .foregroundStyle(DeliveraTheme.ink)
                            Text(restaurant.name)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                        }

                        InfoSection(title: "Kontakt") {
                            if let address = restaurant.address, !address.isEmpty {
                                InfoLine(symbol: "mappin.circle.fill", title: "Adress", value: address)
                            }
                            if let city = restaurant.city, !city.isEmpty {
                                InfoLine(symbol: "building.2.fill", title: "Stad", value: city)
                            }
                            if let phone = restaurant.phone, !phone.isEmpty {
                                InfoLine(symbol: "phone.fill", title: "Telefon", value: phone)
                            }
                        }

                        InfoSection(title: "Öppettider") {
                            ForEach(openingHourLines, id: \.self) { line in
                                Text(line)
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(DeliveraTheme.ink.opacity(0.78))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            if (restaurant.openingHours?.specialCount ?? 0) > 0 {
                                InfoLine(symbol: "calendar.badge.exclamationmark", title: "Avvikande öppettider", value: "Finns")
                            }
                        }

                        InfoSection(title: "Juridik") {
                            if let legalName = restaurant.legalName, !legalName.isEmpty {
                                InfoLine(symbol: "doc.text.fill", title: "Juridiskt namn", value: legalName)
                            }
                            if let organizationNumber = restaurant.organizationNumber, !organizationNumber.isEmpty {
                                InfoLine(symbol: "number", title: "Org.nr", value: organizationNumber)
                            }
                        }
                    }
                    .padding(20)
                }
            }
        }
    }

    private var openingHourLines: [String] {
        guard let hours = restaurant.openingHours else { return ["Inga öppettider angivna"] }
        let order = [
            ("monday", "Måndag"),
            ("tuesday", "Tisdag"),
            ("wednesday", "Onsdag"),
            ("thursday", "Torsdag"),
            ("friday", "Fredag"),
            ("saturday", "Lördag"),
            ("sunday", "Söndag")
        ]
        return order.map { key, label in
            guard let day = hours.days[key], !day.closed, !day.slots.isEmpty else {
                return "\(label): Stängt"
            }
            let times = day.slots.map { slot in
                if let close = slot.close { return "\(slot.open)-\(close)" }
                return slot.open
            }.joined(separator: ", ")
            return "\(label): \(times)"
        }
    }
}

private struct InfoSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 17, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)
            content
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct InfoLine: View {
    let symbol: String
    let title: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .black))
                .foregroundStyle(DeliveraTheme.orange)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
                Text(value)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(DeliveraTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct ProductQuickView: View {
    let product: MenuProduct
    let restaurantIsOrderingEnabled: Bool
    var initialExtras: [SelectedExtra] = []
    var initialQuantity = 1
    var primaryActionTitle = "Lägg till"
    let onAdd: ([SelectedExtra], Int, Bool, Int?) -> Void

    @State private var selectedExtras: [SelectedExtra] = []
    @State private var quantity = 1
    @State private var selectionError: String?
    @State private var dpoints: DpointsMe?

    private var groups: [MenuExtraGroup] {
        product.extraGroups ?? []
    }

    private var extrasTotal: Double {
        selectedExtras.reduce(0) { $0 + $1.total }
    }

    private var totalPrice: Double {
        (product.effectivePrice + extrasTotal) * Double(quantity)
    }

    private var dpointsUnitCost: Int {
        product.dpointsUnitCost(valuePerKr: dpoints?.valuePerKr ?? 10, extrasTotal: extrasTotal)
    }

    private var dpointsCost: Int {
        dpointsUnitCost * quantity
    }

    private var canBuyWithDpoints: Bool {
        dpoints?.enabled == true &&
            product.rewardable == true &&
            dpointsCost > 0 &&
            (dpoints?.balance ?? 0) >= dpointsCost &&
            restaurantIsOrderingEnabled
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    if product.hasImage {
                        RemoteImage(urlString: product.imageUrl, contentMode: .fit, showsFailureIcon: false)
                            .frame(height: 210)
                            .frame(maxWidth: .infinity)
                            .background(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text(product.name)
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundStyle(DeliveraTheme.ink)
                        DpointsPriceBadge(
                            product: product,
                            valuePerKr: dpoints?.valuePerKr ?? 10,
                            extrasTotal: extrasTotal,
                            quantity: quantity
                        )
                        if product.hideDescription != true, let description = product.description, !description.isEmpty {
                            Text(description)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(DeliveraTheme.muted)
                                .lineSpacing(3)
                        }
                    }

                    ForEach(groups) { group in
                        ExtraGroupView(
                            group: group,
                            selectedExtras: selectedExtras,
                            onToggle: { extra in toggleExtra(group: group, extra: extra) },
                            onQuantityChange: { extra, delta in updateQuantityExtra(group: group, extra: extra, delta: delta) }
                        )
                    }

                    StepperRow(quantity: $quantity)

                    if let selectionError {
                        Text(selectionError)
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(DeliveraTheme.orange)
                            .padding(.horizontal, 2)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 18)
            }

            VStack(spacing: 10) {
                if canBuyWithDpoints {
                    Button {
                        guard validateSelection() else { return }
                        onAdd(selectedExtras, quantity, true, dpointsUnitCost)
                    } label: {
                        HStack(spacing: 10) {
                            DpointsGlyph(size: 18)
                            Text("Köp med Dpoints")
                            Spacer()
                            Text("\(dpointsCost) Dpoints")
                        }
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                        .padding(.horizontal, 16)
                        .frame(height: 52)
                        .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.gold.opacity(0.7), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    guard validateSelection() else { return }
                    onAdd(selectedExtras, quantity, false, nil)
                } label: {
                    HStack {
                        Text(restaurantIsOrderingEnabled ? primaryActionTitle : "Stängt")
                        Spacer()
                        Text(priceText(totalPrice))
                    }
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(height: 56)
                    .background(restaurantIsOrderingEnabled ? DeliveraTheme.orange : DeliveraTheme.muted, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!restaurantIsOrderingEnabled)
            }
            .padding(20)
            .background(.ultraThinMaterial)
        }
        .background(DeliveraTheme.appBackground.ignoresSafeArea())
        .onAppear {
            selectedExtras = initialExtras.isEmpty ? defaultExtras() : initialExtras
            quantity = max(1, initialQuantity)
        }
        .task {
            dpoints = try? await DeliveraAPI().dpointsMe()
        }
    }

    private func defaultExtras() -> [SelectedExtra] {
        groups.flatMap { group in
            group.extras.filter { $0.isDefault == true }.map { extra in
                SelectedExtra(
                    groupId: group.id,
                    groupName: group.name,
                    extraId: extra.id,
                    name: extra.name,
                    price: extra.priceAddon ?? 0,
                    quantity: 1
                )
            }
        }
    }

    private func selectedCount(in group: MenuExtraGroup) -> Int {
        let matches = selectedExtras.filter { $0.groupId == group.id }
        if group.allowQuantity == true {
            return matches.reduce(0) { $0 + $1.quantity }
        }
        return matches.count
    }

    private func toggleExtra(group: MenuExtraGroup, extra: MenuExtra) {
        selectionError = nil

        if group.allowQuantity == true {
            updateQuantityExtra(group: group, extra: extra, delta: selectedExtras.contains { $0.extraId == extra.id } ? -selectedQuantity(extraID: extra.id) : 1)
            return
        }

        let selected = SelectedExtra(
            groupId: group.id,
            groupName: group.name,
            extraId: extra.id,
            name: extra.name,
            price: extra.priceAddon ?? 0,
            quantity: 1
        )

        if group.type == "RADIO" {
            if selectedExtras.contains(where: { $0.extraId == extra.id }) { return }
            selectedExtras = selectedExtras.filter { $0.groupId != group.id } + [selected]
            return
        }

        if selectedExtras.contains(where: { $0.extraId == extra.id }) {
            selectedExtras.removeAll { $0.extraId == extra.id }
        } else if selectedCount(in: group) < (group.maxSelections ?? 99) {
            selectedExtras.append(selected)
        }
    }

    private func updateQuantityExtra(group: MenuExtraGroup, extra: MenuExtra, delta: Int) {
        selectionError = nil
        let current = selectedQuantity(extraID: extra.id)
        let otherTotal = selectedExtras
            .filter { $0.groupId == group.id && $0.extraId != extra.id }
            .reduce(0) { $0 + $1.quantity }
        let maxSelections = group.maxSelections ?? 99
        let nextQuantity = max(0, min(current + delta, maxSelections - otherTotal))

        selectedExtras.removeAll { $0.extraId == extra.id }
        if nextQuantity > 0 {
            selectedExtras.append(
                SelectedExtra(
                    groupId: group.id,
                    groupName: group.name,
                    extraId: extra.id,
                    name: extra.name,
                    price: extra.priceAddon ?? 0,
                    quantity: nextQuantity
                )
            )
        }
    }

    private func selectedQuantity(extraID: String) -> Int {
        selectedExtras.first { $0.extraId == extraID }?.quantity ?? 0
    }

    private func validateSelection() -> Bool {
        for group in groups where !group.extras.isEmpty {
            let count = selectedCount(in: group)
            if group.required == true, count == 0 {
                selectionError = "Välj \(group.name.lowercased())."
                return false
            }
            if count < (group.minSelections ?? 0) {
                selectionError = "Välj minst \(group.minSelections ?? 0) i \(group.name)."
                return false
            }
            if count > (group.maxSelections ?? 99) {
                selectionError = "Välj max \(group.maxSelections ?? 99) i \(group.name)."
                return false
            }
        }
        selectionError = nil
        return true
    }
}

private struct ExtraGroupView: View {
    let group: MenuExtraGroup
    let selectedExtras: [SelectedExtra]
    let onToggle: (MenuExtra) -> Void
    let onQuantityChange: (MenuExtra, Int) -> Void
    @State private var expanded = false

    private var selectionCount: Int {
        let matches = selectedExtras.filter { $0.groupId == group.id }
        if group.allowQuantity == true {
            return matches.reduce(0) { $0 + $1.quantity }
        }
        return matches.count
    }

    private var isBoxImage: Bool {
        group.displayStyle?.uppercased() == "BOX_IMAGE"
    }

    var body: some View {
        let visibleExtras = expanded || group.extras.count <= 8 ? group.extras : Array(group.extras.prefix(8))
        let columnCount = group.extras.count <= 2 ? 2 : 3
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: columnCount)

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(group.name)
                        .font(.system(size: 17, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(group.required == true ? "Obligatoriskt" : "Valfritt")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
                Spacer()
                if (group.maxSelections ?? 0) > 1 || group.allowQuantity == true {
                    Text("\(selectionCount)/\(group.maxSelections ?? 99)")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.orange)
                }
            }

            if isBoxImage {
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(visibleExtras) { extra in
                        ExtraBoxOptionCard(
                            group: group,
                            extra: extra,
                            selected: selectedExtras.contains { $0.extraId == extra.id },
                            quantity: selectedExtras.first { $0.extraId == extra.id }?.quantity ?? 0,
                            onToggle: { onToggle(extra) },
                            onQuantityChange: { onQuantityChange(extra, $0) }
                        )
                    }
                }
            } else {
                VStack(spacing: 8) {
                    ForEach(visibleExtras) { extra in
                        ExtraOptionRow(
                            group: group,
                            extra: extra,
                            selected: selectedExtras.contains { $0.extraId == extra.id },
                            quantity: selectedExtras.first { $0.extraId == extra.id }?.quantity ?? 0,
                            onToggle: { onToggle(extra) },
                            onQuantityChange: { onQuantityChange(extra, $0) }
                        )
                    }
                }
            }

            if group.extras.count > 8 {
                Button {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
                        expanded.toggle()
                    }
                } label: {
                    Text(expanded ? "Visa färre" : "Visa mer")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(DeliveraTheme.orange)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(DeliveraTheme.orange.opacity(0.08), in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct ExtraBoxOptionCard: View {
    let group: MenuExtraGroup
    let extra: MenuExtra
    let selected: Bool
    let quantity: Int
    let onToggle: () -> Void
    let onQuantityChange: (Int) -> Void

    var body: some View {
        VStack(spacing: 8) {
            Button(action: onToggle) {
                VStack(spacing: 7) {
                    if extra.hasImage {
                        RemoteImage(urlString: extra.imageUrl, contentMode: .fit, showsFailureIcon: false)
                            .frame(height: 54)
                            .frame(maxWidth: .infinity)
                    }

                    Text(extra.name)
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.78)

                    if (extra.priceAddon ?? 0) > 0 {
                        Text("+\(priceText(extra.priceAddon ?? 0))")
                            .font(.system(size: 11, weight: .black))
                            .foregroundStyle(DeliveraTheme.muted)
                    }
                }
                .padding(9)
                .frame(maxWidth: .infinity)
                .frame(minHeight: extra.hasImage ? 126 : 82)
                .contentShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                .background(selected || quantity > 0 ? DeliveraTheme.orange.opacity(0.1) : Color.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                        .stroke(selected || quantity > 0 ? DeliveraTheme.orange : DeliveraTheme.line, lineWidth: selected || quantity > 0 ? 1.5 : 1)
                )
            }
            .buttonStyle(.plain)

            if group.allowQuantity == true {
                HStack(spacing: 7) {
                    Button { onQuantityChange(-1) } label: {
                        Image(systemName: "minus")
                            .font(.system(size: 10, weight: .black))
                            .frame(width: 24, height: 24)
                    }
                    .disabled(quantity <= 0)

                    Text("\(quantity)")
                        .font(.system(size: 12, weight: .black))
                        .frame(width: 16)

                    Button { onQuantityChange(1) } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 10, weight: .black))
                            .frame(width: 24, height: 24)
                    }
                }
                .foregroundStyle(DeliveraTheme.ink)
                .background(Color.black.opacity(0.05), in: Capsule())
            }
        }
    }
}

private struct ExtraOptionRow: View {
    let group: MenuExtraGroup
    let extra: MenuExtra
    let selected: Bool
    let quantity: Int
    let onToggle: () -> Void
    let onQuantityChange: (Int) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                HStack(spacing: 10) {
                    Image(systemName: group.type == "RADIO" ? (selected ? "largecircle.fill.circle" : "circle") : (selected ? "checkmark.square.fill" : "square"))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(selected ? DeliveraTheme.orange : DeliveraTheme.muted.opacity(0.7))
                    Text(extra.name)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(DeliveraTheme.ink)
                        .lineLimit(1)
                    Spacer()
                    if (extra.priceAddon ?? 0) > 0 {
                        Text("+\(priceText(extra.priceAddon ?? 0))")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(DeliveraTheme.muted)
                    }
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if group.allowQuantity == true {
                HStack(spacing: 8) {
                    Button { onQuantityChange(-1) } label: {
                        Image(systemName: "minus")
                            .font(.system(size: 11, weight: .black))
                            .frame(width: 26, height: 26)
                    }
                    .disabled(quantity <= 0)
                    Text("\(quantity)")
                        .font(.system(size: 13, weight: .black))
                        .frame(width: 18)
                    Button { onQuantityChange(1) } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .black))
                            .frame(width: 26, height: 26)
                    }
                }
                .foregroundStyle(DeliveraTheme.ink)
                .background(Color.black.opacity(0.05), in: Capsule())
            }
        }
        .padding(.vertical, 2)
    }
}

private struct StepperRow: View {
    @Binding var quantity: Int

    var body: some View {
        HStack {
            Text("Antal")
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)
            Spacer()
            HStack(spacing: 10) {
                Button {
                    quantity = max(1, quantity - 1)
                } label: {
                    Image(systemName: "minus")
                        .frame(width: 34, height: 34)
                }
                .disabled(quantity <= 1)
                Text("\(quantity)")
                    .font(.system(size: 16, weight: .black))
                    .frame(width: 24)
                Button {
                    quantity += 1
                } label: {
                    Image(systemName: "plus")
                        .frame(width: 34, height: 34)
                }
            }
            .foregroundStyle(DeliveraTheme.ink)
            .background(.white, in: Capsule())
            .overlay(Capsule().stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .padding(14)
        .background(.white.opacity(0.76), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct MenuHeaderYPreferenceKey: PreferenceKey {
    static let defaultValue: CGFloat = .greatestFiniteMagnitude

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct RestaurantHeroRevealPattern: View {
    let active: Bool

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            ZStack {
                LinearGradient(
                    colors: [
                        DeliveraTheme.orange.opacity(active ? 0.18 : 0),
                        Color.white.opacity(active ? 0.16 : 0),
                        Color.clear
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                ForEach(0..<18, id: \.self) { index in
                    DpointsGlyph(size: CGFloat(13 + (index % 4) * 5))
                        .opacity(active ? 0.16 : 0)
                        .rotationEffect(.degrees(t * 22 + Double(index * 17)))
                        .scaleEffect(active ? 1 : 1.55)
                        .offset(
                            x: CGFloat((index % 6) * 74 - 170),
                            y: CGFloat((index / 6) * 72 - 92) + CGFloat(sin(t + Double(index))) * 9
                        )
                        .animation(.easeOut(duration: 0.42).delay(Double(index) * 0.012), value: active)
                }
            }
        }
        .allowsHitTesting(false)
    }
}

private struct CircleIconButton: View {
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)
                .frame(width: 40, height: 40)
                .background(.white.opacity(0.94), in: Circle())
        }
        .buttonStyle(.plain)
    }
}

private struct SwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        Controller()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

    private final class Controller: UIViewController, UIGestureRecognizerDelegate {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            navigationController?.interactivePopGestureRecognizer?.delegate = self
            navigationController?.interactivePopGestureRecognizer?.isEnabled = true
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            (navigationController?.viewControllers.count ?? 0) > 1
        }
    }
}

private struct EmptyMenuView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Menyn är tom")
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)
            Text("Restaurangen har inga aktiva produkter just nu.")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(DeliveraTheme.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct RestaurantReviewsView: View {
    let restaurant: Restaurant
    @State private var response: RestaurantReviewsResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedFilter: ReviewFilter = .all
    private let api = DeliveraAPI()

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Recensioner")
                            .font(.system(size: 34, weight: .black, design: .rounded))
                            .foregroundStyle(DeliveraTheme.ink)
                        Text(restaurant.name)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                    }

                    if let response {
                        HStack(spacing: 12) {
                            RatingBadge(value: response.averageRating > 0 ? response.averageRating : restaurant.rating ?? 4.6)
                            Text("\(response.totalCount) recensioner")
                                .font(.system(size: 14, weight: .black))
                                .foregroundStyle(DeliveraTheme.ink)
                        }

                        ReviewFilterRail(selected: $selectedFilter)

                        if filteredReviews.isEmpty {
                            Text("Inga skrivna recensioner ännu.")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        } else {
                            ForEach(filteredReviews) { review in
                                ReviewRow(review: review)
                            }
                        }
                    } else if isLoading {
                        ForEach(0..<4, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(.white.opacity(0.75))
                                .frame(height: 116)
                                .redacted(reason: .placeholder)
                        }
                    } else if let errorMessage {
                        NoticeBanner(text: errorMessage)
                    }
                }
                .padding(20)
            }
        }
        .navigationTitle("")
        .task {
            await load()
        }
    }

    private func load() async {
        isLoading = true
        do {
            response = try await api.restaurantReviews(slug: restaurant.slug)
            errorMessage = nil
        } catch {
            errorMessage = "Kunde inte hämta recensioner."
        }
        isLoading = false
    }

    private var filteredReviews: [RestaurantReview] {
        guard let reviews = response?.reviews else { return [] }
        switch selectedFilter {
        case .all:
            return reviews
        case .five:
            return reviews.filter { ($0.rating ?? 0) == 5 }
        case .fourPlus:
            return reviews.filter { ($0.rating ?? 0) >= 4 }
        case .comment:
            return reviews.filter { !($0.comment ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        case .reply:
            return reviews.filter { !($0.reply ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
    }
}

private enum ReviewFilter: String, CaseIterable, Identifiable {
    case all
    case five
    case fourPlus
    case comment
    case reply

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "Alla"
        case .five: return "5 stjärnor"
        case .fourPlus: return "4+"
        case .comment: return "Med kommentar"
        case .reply: return "Med svar"
        }
    }
}

private struct ReviewFilterRail: View {
    @Binding var selected: ReviewFilter

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ReviewFilter.allCases) { filter in
                    Button {
                        selected = filter
                    } label: {
                        Text(filter.title)
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(selected == filter ? .white : DeliveraTheme.ink)
                            .padding(.horizontal, 12)
                            .frame(height: 34)
                            .background(selected == filter ? DeliveraTheme.orange : .white, in: Capsule())
                            .overlay(Capsule().stroke(DeliveraTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.trailing, 20)
        }
    }
}

private struct ReviewRow: View {
    let review: RestaurantReview

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(review.customerName)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                    if let liked = review.likedItems, !liked.isEmpty {
                        Text(liked.prefix(3).joined(separator: ", "))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                            .lineLimit(1)
                    }
                }
                Spacer()
                HStack(spacing: 3) {
                    Image(systemName: "star.fill")
                        .foregroundStyle(DeliveraTheme.gold)
                    Text("\(review.rating ?? 0)")
                        .font(.system(size: 13, weight: .black))
                }
            }

            if let comment = review.comment, !comment.isEmpty {
                Text(comment)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(DeliveraTheme.ink.opacity(0.78))
                    .lineSpacing(3)
            }

            if let reply = review.reply, !reply.isEmpty {
                Text(reply)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(15)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

func priceText(_ value: Double) -> String {
    if value.rounded() == value {
        return "\(Int(value)) kr"
    }
    return String(format: "%.2f kr", value).replacingOccurrences(of: ".", with: ",")
}
