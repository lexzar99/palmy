import SwiftUI
import UIKit

#if canImport(Adyen) && canImport(AdyenActions) && canImport(AdyenCard) && canImport(AdyenCheckout)
import Adyen
import AdyenActions
import AdyenCard
import AdyenCheckout
#endif

private extension UIApplication {
    func dismissKeyboard() {
        sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

struct CartView: View {
    @ObservedObject var cartStore: CartStore
    let isLoggedIn: Bool
    let onPaymentCompleted: (ActiveHomeOrder) -> Void
    let onExploreRestaurants: () -> Void
    let onPickRecommended: (MenuProduct) -> Void
    let onEditItem: (CartDraftItem) -> Void

    @AppStorage("delivera.cart.guestName") private var guestName = ""
    @AppStorage("delivera.cart.guestPhone") private var guestPhone = ""
    @AppStorage("delivera.cart.note") private var note = ""
    @State private var coupon = ""
    @State private var tip = 0.0
    @State private var showContact = true
    @State private var showNote = false
    @State private var showCoupon = false
    @State private var showTip = false
    @State private var emptyAnimation = false
    @State private var isStartingPayment = false
    @State private var paymentError: String?
    @State private var paymentSheet: AdyenCheckoutState?
    @State private var pendingPaymentOrderId: String?
    @State private var pendingHomeOrder: ActiveHomeOrder?
    @FocusState private var isTextInputFocused: Bool

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    header

                    if cartStore.items.isEmpty {
                        emptyState
                    } else {
                        orderModeCard
                            .cartEntrance(delay: 0)
                        contactSection
                            .cartEntrance(delay: 0.04)
                        itemsSection
                            .cartEntrance(delay: 0.08)
                        frequentlyBoughtSection
                            .cartEntrance(delay: 0.12)
                        collapsedFields
                            .cartEntrance(delay: 0.16)
                        totalsSection
                            .cartEntrance(delay: 0.2)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 112)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Klar") {
                    isTextInputFocused = false
                }
                .font(.system(size: 14, weight: .black))
            }
        }
        .sheet(item: $paymentSheet) { state in
            AdyenCheckoutSheet(
                state: state,
                onCompleted: {
                    if let pendingHomeOrder {
                        onPaymentCompleted(pendingHomeOrder)
                    }
                    pendingPaymentOrderId = nil
                    pendingHomeOrder = nil
                    cartStore.clear()
                    paymentSheet = nil
                },
                onVerify: { sessionId, sessionResult in
                    await verifyNativeAdyenPayment(sessionId: sessionId, sessionResult: sessionResult)
                },
                onFailed: { message in
                    paymentError = message
                    pendingHomeOrder = nil
                    abandonPendingPayment()
                    paymentSheet = nil
                },
                onClose: {
                    pendingHomeOrder = nil
                    abandonPendingPayment()
                    paymentSheet = nil
                }
            )
            .presentationDetents([.height(620)])
            .presentationDragIndicator(.visible)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Varukorg")
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(DeliveraTheme.ink)
            Text(cartStore.restaurant?.name ?? "Lägg till något gott")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(DeliveraTheme.muted)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 24) {
            TimelineView(.animation) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                ZStack {
                    ForEach(0..<3, id: \.self) { index in
                        let phase = t + Double(index) * 0.72
                        Circle()
                            .stroke(index.isMultiple(of: 2) ? DeliveraTheme.orange.opacity(0.18) : DeliveraTheme.gold.opacity(0.18), lineWidth: 1.4)
                            .frame(width: CGFloat(118 + index * 58), height: CGFloat(118 + index * 58))
                            .scaleEffect(1 + 0.035 * sin(phase))
                    }

                    EmptyCartFloatingBite(symbol: "takeoutbag.and.cup.and.straw.fill", phase: t, x: -94, y: -28, tint: DeliveraTheme.orange)
                    EmptyCartFloatingBite(symbol: "fork.knife", phase: t + 0.55, x: 88, y: -38, tint: DeliveraTheme.gold)
                    EmptyCartFloatingBite(symbol: "sparkles", phase: t + 1.05, x: 72, y: 54, tint: Color(red: 0.17, green: 0.49, blue: 0.31))

                    ZStack {
                        RoundedRectangle(cornerRadius: 36, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [DeliveraTheme.orange, Color(red: 0.98, green: 0.50, blue: 0.18)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 112, height: 112)
                            .rotationEffect(.degrees(emptyAnimation ? 3 : -3))
                            .shadow(color: DeliveraTheme.orange.opacity(0.28), radius: 30, y: 18)
                        Image(systemName: "bag.fill")
                            .font(.system(size: 42, weight: .black))
                            .foregroundStyle(.white)
                            .offset(y: emptyAnimation ? -3 : 3)
                        Circle()
                            .fill(.white.opacity(0.22))
                            .frame(width: 20, height: 20)
                            .offset(x: 30 + CGFloat(sin(t * 1.2)) * 4, y: -32)
                    }

                    DpointsGlyph(size: 30)
                        .rotationEffect(.degrees(t * 24))
                        .offset(x: CGFloat(cos(t * 0.8)) * 112, y: CGFloat(sin(t * 0.8)) * 74)
                        .shadow(color: DeliveraTheme.orange.opacity(0.22), radius: 14, y: 8)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 250)
            }

            VStack(spacing: 7) {
                Text("Redo när du är")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                Text("Hitta något gott och bygg din nästa beställning.")
                    .font(.system(size: 14, weight: .bold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(DeliveraTheme.muted)
            }

            Button(action: onExploreRestaurants) {
                HStack {
                    Image(systemName: "safari.fill")
                    Text("Utforska restauranger")
                }
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .background(DeliveraTheme.orange, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 26)
        .padding(.horizontal, 10)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.35).repeatForever(autoreverses: true)) {
                emptyAnimation = true
            }
        }
    }

    private var orderModeCard: some View {
        HStack(spacing: 12) {
            Image(systemName: cartStore.orderMode.systemImage)
                .font(.system(size: 17, weight: .black))
                .foregroundStyle(DeliveraTheme.orange)
                .frame(width: 42, height: 42)
                .background(DeliveraTheme.orange.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(cartStore.orderMode == .delivery ? "Leverans" : "Avhämtning")
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                Text(cartStore.orderMode == .delivery ? cartStore.address : "Hämtas hos restaurangen")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(15)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }

    @ViewBuilder
    private var contactSection: some View {
        if !isLoggedIn {
            CollapsibleSection(title: "Kontakt", symbol: "person.crop.circle", expanded: $showContact) {
                VStack(spacing: 10) {
                    CartTextField(title: "Namn", text: $guestName, keyboard: .default)
                        .focused($isTextInputFocused)
                    CartTextField(title: "Telefonnummer", text: $guestPhone, keyboard: .phonePad)
                        .focused($isTextInputFocused)
                }
            }
        }
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Artiklar")
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)

            ForEach(cartStore.items) { item in
                CartItemRow(
                    item: item,
                    onEdit: {
                        if isTextInputFocused {
                            isTextInputFocused = false
                        } else {
                            onEditItem(item)
                        }
                    },
                    onIncrement: { cartStore.increment(item) },
                    onDecrement: { cartStore.decrement(item) }
                )
            }
        }
    }

    @ViewBuilder
    private var frequentlyBoughtSection: some View {
        if !cartStore.recommendedProducts.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Ofta köpta med")
                    .font(.system(size: 18, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(cartStore.recommendedProducts) { product in
                            RecommendedProductCard(product: product) {
                                onPickRecommended(product)
                            }
                        }
                    }
                    .padding(.trailing, 20)
                }
            }
        }
    }

    private var collapsedFields: some View {
        VStack(spacing: 10) {
            CollapsibleSection(title: "Extra notering", symbol: "text.bubble", expanded: $showNote) {
                TextField("Ex. ring inte på dörren", text: $note, axis: .vertical)
                    .font(.system(size: 14, weight: .semibold))
                    .focused($isTextInputFocused)
                    .padding(12)
                    .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            CollapsibleSection(title: "Rabattkod", symbol: "ticket", expanded: $showCoupon) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        CartTextField(title: "Kod", text: $coupon, keyboard: .default)
                            .textInputAutocapitalization(.characters)
                            .focused($isTextInputFocused)
                        Button {
                            Task { await cartStore.applyDiscount(code: coupon) }
                        } label: {
                            Group {
                                if cartStore.isApplyingDiscount {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("Checka")
                                }
                            }
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(.white)
                            .frame(width: 82, height: 46)
                            .background(DeliveraTheme.orange, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(cartStore.isApplyingDiscount)
                    }

                    if let discountSuccess = cartStore.discountSuccess {
                        Label(discountSuccess, systemImage: "checkmark.circle.fill")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(Color.green)
                    }
                    if let discountError = cartStore.discountError {
                        Label(discountError, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(DeliveraTheme.orange)
                    }
                }
            }

            CollapsibleSection(title: "Dricks", symbol: "heart", expanded: $showTip) {
                HStack(spacing: 8) {
                    ForEach([0, 10, 20, 30], id: \.self) { value in
                        Button {
                            tip = Double(value)
                        } label: {
                            Text(value == 0 ? "Ingen" : "\(value) kr")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(tip == Double(value) ? .white : DeliveraTheme.ink)
                                .frame(maxWidth: .infinity)
                                .frame(height: 36)
                                .background(tip == Double(value) ? DeliveraTheme.orange : Color.black.opacity(0.045), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var totalsSection: some View {
        VStack(spacing: 12) {
            TotalLine(title: "Subtotal", value: priceText(cartStore.subtotal))
            TotalLine(title: "Leverans", value: cartStore.orderMode == .pickup ? "0 kr" : priceText(cartStore.deliveryFee))
            if cartStore.appliedDiscount != nil {
                TotalLine(title: "Rabatt", value: cartStore.discount > 0 ? "-\(priceText(cartStore.discount))" : "0 kr")
            }
            TotalLine(title: "Moms \(Int(cartStore.vatRate))%", value: priceText(cartStore.vatAmount))
            Divider()
            TotalLine(title: "Totalt", value: priceText(cartStore.total + tip), prominent: true)

            if let paymentError {
                Label(paymentError, systemImage: "exclamationmark.circle.fill")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(DeliveraTheme.orange)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                Task { await startAdyenPayment() }
            } label: {
                HStack {
                    if isStartingPayment {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(isStartingPayment ? "Väntar" : "Betala")
                    Spacer()
                    Text(priceText(cartStore.total + tip))
                        .font(.system(size: 19, weight: .black, design: .rounded))
                }
                .font(.system(size: 17, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
                .frame(height: 58)
                .background(DeliveraTheme.ink, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(isStartingPayment)

            Button {
                Task { await createTestOrderWithoutPayment() }
            } label: {
                HStack {
                    Image(systemName: "wand.and.stars")
                        .font(.system(size: 15, weight: .black))
                    Text("Skapa order utan betalning")
                    Spacer()
                    Text("Test")
                        .font(.system(size: 12, weight: .black))
                        .padding(.horizontal, 10)
                        .frame(height: 28)
                        .background(DeliveraTheme.orange.opacity(0.12), in: Capsule())
                }
                .font(.system(size: 14, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)
                .padding(.horizontal, 16)
                .frame(height: 50)
                .background(Color.black.opacity(0.045), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(isStartingPayment)
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        .cardShadow()
    }

    private func startAdyenPayment() async {
        paymentError = nil
        guard let restaurant = cartStore.restaurant else {
            paymentError = "Välj en restaurang först."
            return
        }
        let trimmedName = guestName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPhone = guestPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isLoggedIn || trimmedName.count >= 2 else {
            showContact = true
            paymentError = "Skriv namn innan betalning."
            return
        }
        guard isLoggedIn || trimmedPhone.count >= 6 else {
            showContact = true
            paymentError = "Skriv ett giltigt telefonnummer."
            return
        }

        isStartingPayment = true
        defer { isStartingPayment = false }

        do {
            let request = CartOrderRequest(
                restaurantId: restaurant.id,
                restaurantSlug: restaurant.slug,
                type: cartStore.orderMode == .delivery ? "DELIVERY" : "PICKUP",
                paymentMethod: "ADYEN",
                customerName: isLoggedIn ? "Profilkund" : trimmedName,
                customerPhone: isLoggedIn ? "0000000000" : trimmedPhone,
                customerEmail: nil,
                deliveryStreet: cartStore.orderMode == .delivery ? cartStore.address : nil,
                deliveryCity: cartStore.orderMode == .delivery ? restaurant.city : nil,
                deliveryZip: nil,
                deliveryLatitude: cartStore.deliveryCoordinate?.lat,
                deliveryLongitude: cartStore.deliveryCoordinate?.lng,
                deliveryNote: note.isEmpty ? nil : note,
                note: note.isEmpty ? nil : note,
                discountCode: cartStore.appliedDiscount?.code,
                items: cartStore.items.map { item in
                    CartOrderItemRequest(
                        productId: item.productID,
                        quantity: item.quantity,
                        note: nil,
                        selectedExtras: item.extras.map {
                            CartOrderExtraRequest(
                                groupId: $0.groupId,
                                groupName: $0.groupName,
                                extraId: $0.extraId,
                                extraName: $0.name,
                                priceAddon: $0.price,
                                quantity: $0.quantity
                            )
                        },
                        paidWithPoints: item.paidWithPoints ? true : nil
                    )
                },
                stripePaymentIntentId: nil,
                lat: cartStore.deliveryCoordinate?.lat,
                lng: cartStore.deliveryCoordinate?.lng,
                pendingPayment: true,
                tip: tip > 0 ? tip : nil
            )
            let order = try await DeliveraAPI().createOrder(
                request,
                idempotencyKey: "swift-adyen-\(UUID().uuidString)"
            )
            guard let orderId = order.resolvedOrderId else {
                paymentError = "Servern returnerade inget order-ID."
                return
            }
            pendingPaymentOrderId = orderId
            let returnURL = "https://delivera.se/adyen-return?orderId=\(orderId)"
            let payment = try await DeliveraAPI().createAdyenPayment(orderId: orderId, returnURL: returnURL)
            guard let session = payment.session else {
                paymentError = "Adyen-session saknas i serversvaret."
                return
            }
            let total = payment.total ?? cartStore.total + tip
            pendingHomeOrder = ActiveHomeOrder.paid(
                orderId: orderId,
                restaurant: restaurant,
                mode: cartStore.orderMode,
                address: cartStore.address,
                total: total,
                coordinate: cartStore.deliveryCoordinate,
                accessToken: order.accessToken,
                deliveryFee: cartStore.deliveryFee,
                discountAmount: cartStore.discount,
                items: cartStore.items.map { item in
                    ActiveOrderLine(
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice + item.extras.reduce(0) { $0 + ($1.price * Double($1.quantity)) },
                        extras: item.extras.map { "\($0.quantity)x \($0.name)" }
                    )
                }
            )
            paymentSheet = AdyenCheckoutState(
                orderId: orderId,
                returnURL: returnURL,
                session: session,
                total: total
            )
        } catch {
            paymentError = error.localizedDescription
            abandonPendingPayment()
        }
    }

    private func createTestOrderWithoutPayment() async {
        paymentError = nil
        guard let restaurant = cartStore.restaurant else {
            paymentError = "Välj en restaurang först."
            return
        }
        let trimmedName = guestName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPhone = guestPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isLoggedIn || trimmedName.count >= 2 else {
            showContact = true
            paymentError = "Skriv namn innan testordern."
            return
        }
        guard isLoggedIn || trimmedPhone.count >= 6 else {
            showContact = true
            paymentError = "Skriv ett giltigt telefonnummer."
            return
        }

        isStartingPayment = true
        defer { isStartingPayment = false }

        do {
            let request = CartOrderRequest(
                restaurantId: restaurant.id,
                restaurantSlug: restaurant.slug,
                type: cartStore.orderMode == .delivery ? "DELIVERY" : "PICKUP",
                paymentMethod: "TEST",
                customerName: isLoggedIn ? "Profilkund" : trimmedName,
                customerPhone: isLoggedIn ? "0000000000" : trimmedPhone,
                customerEmail: nil,
                deliveryStreet: cartStore.orderMode == .delivery ? cartStore.address : nil,
                deliveryCity: cartStore.orderMode == .delivery ? restaurant.city : nil,
                deliveryZip: nil,
                deliveryLatitude: cartStore.deliveryCoordinate?.lat,
                deliveryLongitude: cartStore.deliveryCoordinate?.lng,
                deliveryNote: note.isEmpty ? nil : note,
                note: note.isEmpty ? nil : note,
                discountCode: "test",
                items: cartStore.items.map { item in
                    CartOrderItemRequest(
                        productId: item.productID,
                        quantity: item.quantity,
                        note: nil,
                        selectedExtras: item.extras.map {
                            CartOrderExtraRequest(
                                groupId: $0.groupId,
                                groupName: $0.groupName,
                                extraId: $0.extraId,
                                extraName: $0.name,
                                priceAddon: $0.price,
                                quantity: $0.quantity
                            )
                        },
                        paidWithPoints: item.paidWithPoints ? true : nil
                    )
                },
                stripePaymentIntentId: "TEST_PAYMENT",
                lat: cartStore.deliveryCoordinate?.lat,
                lng: cartStore.deliveryCoordinate?.lng,
                pendingPayment: false,
                tip: tip > 0 ? tip : nil
            )
            let order = try await DeliveraAPI().createOrder(
                request,
                idempotencyKey: "swift-test-order-\(UUID().uuidString)"
            )
            guard let orderId = order.resolvedOrderId else {
                paymentError = "Servern returnerade inget order-ID."
                return
            }

            let homeOrder = ActiveHomeOrder.paid(
                orderId: orderId,
                restaurant: restaurant,
                mode: cartStore.orderMode,
                address: cartStore.address,
                total: cartStore.total + tip,
                coordinate: cartStore.deliveryCoordinate,
                accessToken: order.accessToken,
                status: .accepted,
                deliveryFee: cartStore.deliveryFee,
                discountAmount: cartStore.discount,
                items: cartStore.items.map { item in
                    ActiveOrderLine(
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice + item.extras.reduce(0) { $0 + ($1.price * Double($1.quantity)) },
                        extras: item.extras.map { "\($0.quantity)x \($0.name)" }
                    )
                }
            )
            onPaymentCompleted(homeOrder)
            cartStore.clear()
        } catch {
            paymentError = error.localizedDescription
        }
    }

    private func verifyNativeAdyenPayment(sessionId: String, sessionResult: String) async -> Result<Void, Error> {
        guard let orderId = pendingPaymentOrderId else {
            return .failure(APIError.message("Ordern saknas för betalningen."))
        }
        do {
            let response = try await DeliveraAPI().verifyAdyenPayment(orderId: orderId, sessionId: sessionId, sessionResult: sessionResult)
            if response.paid == true {
                do {
                    let latestOrder = try await DeliveraAPI().customerOrder(
                        id: orderId,
                        phone: guestPhone,
                        token: pendingHomeOrder?.accessToken
                    )
                    await MainActor.run {
                        pendingHomeOrder = pendingHomeOrder?.applyingDatabaseOrder(latestOrder)
                    }
                } catch {
                    print("Could not refresh paid order before tracking:", error.localizedDescription)
                }
                pendingPaymentOrderId = nil
                return .success(())
            }
            if response.failed == true {
                let status = response.status?.lowercased()
                let message = status == "refused"
                    ? "Adyen nekade betalningen. I testläge behöver du använda ett godkänt Adyen-testkort eller en aktiverad testmetod."
                    : "Betalningen misslyckades\(response.status.map { ": \($0)" } ?? ".")"
                return .failure(APIError.message(message))
            }
            return .failure(APIError.message("Betalningen väntar fortfarande hos Adyen. Försök igen om en stund."))
        } catch {
            return .failure(error)
        }
    }

    private func abandonPendingPayment() {
        guard let orderId = pendingPaymentOrderId else { return }
        let phone = guestPhone
        pendingPaymentOrderId = nil
        pendingHomeOrder = nil
        Task {
            await DeliveraAPI().abandonOrder(orderId: orderId, phone: phone)
        }
    }
}

private struct CartItemRow: View {
    let item: CartDraftItem
    let onEdit: () -> Void
    let onIncrement: () -> Void
    let onDecrement: () -> Void

    var body: some View {
        Button(action: onEdit) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.name)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                    if !item.extras.isEmpty {
                        Text(item.extras.map { "\($0.quantity)x \($0.name)" }.joined(separator: ", "))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(DeliveraTheme.muted)
                            .lineLimit(3)
                    }
                    if item.paidWithPoints {
                        HStack(spacing: 5) {
                            DpointsGlyph(size: 15)
                            Text("\(item.dpointsUnitCost ?? 0) Dpoints")
                                .font(.system(size: 13, weight: .black))
                        }
                        .foregroundStyle(DeliveraTheme.orange)
                    } else {
                        Text(priceText(item.unitTotal))
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                    }
                }
                Spacer()
                HStack(spacing: 8) {
                    Button(action: onDecrement) {
                        Image(systemName: "minus")
                            .font(.system(size: 11, weight: .black))
                            .frame(width: 28, height: 28)
                    }
                    Text("\(item.quantity)")
                        .font(.system(size: 13, weight: .black))
                        .frame(width: 18)
                    Button(action: onIncrement) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .black))
                            .frame(width: 28, height: 28)
                    }
                }
                .foregroundStyle(DeliveraTheme.ink)
                .background(Color.black.opacity(0.05), in: Capsule())
            }
            .padding(14)
            .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct RecommendedProductCard: View {
    let product: MenuProduct
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 7) {
                if product.hasImage {
                    RemoteImage(urlString: product.imageUrl, contentMode: .fit, showsFailureIcon: false)
                        .frame(width: 104, height: 78)
                        .background(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                Text(product.name)
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    Text(priceText(product.effectivePrice))
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.orange)
                    DpointsPriceBadge(product: product)
                }
            }
            .padding(10)
            .frame(width: 124, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct CollapsibleSection<Content: View>: View {
    let title: String
    let symbol: String
    @Binding var expanded: Bool
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 12) {
            Button {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) {
                    expanded.toggle()
                }
            } label: {
                HStack {
                    Image(systemName: symbol)
                        .foregroundStyle(DeliveraTheme.orange)
                    Text(title)
                        .font(.system(size: 15, weight: .black))
                    Spacer()
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .foregroundStyle(DeliveraTheme.ink)
            }
            .buttonStyle(.plain)

            if expanded {
                content
            }
        }
        .padding(15)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct CartTextField: View {
    let title: String
    @Binding var text: String
    let keyboard: UIKeyboardType

    var body: some View {
        TextField(title, text: $text)
            .keyboardType(keyboard)
            .font(.system(size: 14, weight: .semibold))
            .padding(.horizontal, 12)
            .frame(height: 46)
            .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct TotalLine: View {
    let title: String
    let value: String
    var prominent = false

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
        }
        .font(.system(size: prominent ? 18 : 13, weight: prominent ? .black : .bold))
        .foregroundStyle(prominent ? DeliveraTheme.ink : DeliveraTheme.muted)
    }
}

private struct CartContentSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            CartSkeletonRow(height: 72, icon: true, lines: [132, 210])
            VStack(alignment: .leading, spacing: 10) {
                CartSkeletonLine(width: 84, height: 18)
                ForEach(0..<2, id: \.self) { index in
                    CartSkeletonRow(height: 76, icon: false, lines: [CGFloat(150 + index * 22), 118])
                }
            }
            CartSkeletonRail()
            CartSkeletonRow(height: 178, icon: false, lines: [120, 260, 220, 180])
        }
        .transition(.opacity)
    }
}

private struct CartSkeletonRow: View {
    let height: CGFloat
    let icon: Bool
    let lines: [CGFloat]

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            HStack(spacing: 12) {
                if icon {
                    CartSkeletonLine(width: 42, height: 42, cornerRadius: 21, phase: t)
                }
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { offset, width in
                        CartSkeletonLine(width: width, height: offset == 0 ? 15 : 12, phase: t + Double(offset) * 0.12)
                    }
                }
                Spacer()
            }
            .padding(15)
            .frame(height: height)
            .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
    }
}

private struct CartSkeletonRail: View {
    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(0..<3, id: \.self) { index in
                        VStack(alignment: .leading, spacing: 8) {
                            CartSkeletonLine(width: 104, height: 78, cornerRadius: 14, phase: t + Double(index) * 0.16)
                            CartSkeletonLine(width: 86, height: 12, phase: t + Double(index) * 0.16)
                            CartSkeletonLine(width: 58, height: 12, phase: t + Double(index) * 0.16)
                        }
                        .padding(10)
                        .frame(width: 124, alignment: .leading)
                        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                    }
                }
                .padding(.trailing, 20)
            }
        }
    }
}

private struct CartSkeletonLine: View {
    let width: CGFloat
    let height: CGFloat
    var cornerRadius: CGFloat = 6
    var phase: TimeInterval = 0

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.black.opacity(0.055))
            .frame(width: width, height: height)
            .overlay {
                GeometryReader { proxy in
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.clear, .white.opacity(0.62), .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(width: max(24, proxy.size.width * 0.42))
                        .rotationEffect(.degrees(14))
                        .offset(x: CGFloat((sin(phase * 1.15) + 1) * 0.5) * proxy.size.width * 1.35 - proxy.size.width * 0.36)
                        .blur(radius: 7)
                }
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            }
    }
}

private struct CartEntranceModifier: ViewModifier {
    let delay: Double
    @State private var visible = false

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible ? 0 : 14)
            .scaleEffect(visible ? 1 : 0.988)
            .onAppear {
                visible = false
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(.spring(response: 0.46, dampingFraction: 0.86)) {
                        visible = true
                    }
                }
            }
    }
}

private extension View {
    func cartEntrance(delay: Double) -> some View {
        modifier(CartEntranceModifier(delay: delay))
    }
}

private struct AdyenCheckoutState: Identifiable {
    let id = UUID()
    let orderId: String
    let returnURL: String
    let session: AdyenSession
    let total: Double
}

private struct AdyenCheckoutSheet: View {
    let state: AdyenCheckoutState
    let onCompleted: () -> Void
    let onVerify: (String, String) async -> Result<Void, Error>
    let onFailed: (String) -> Void
    let onClose: () -> Void
    @State private var selectedMethod: NativePaymentMethod = .card
    @State private var statusMessage: String?
    @State private var isVerifying = false

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()
            VStack(spacing: 0) {
                paymentHeader
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        ForEach(NativePaymentMethod.availableMethods) { method in
                            NativePaymentMethodButton(method: method, selected: selectedMethod == method) {
                                withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                                    selectedMethod = method
                                    statusMessage = nil
                                }
                            }
                        }
                    }

                    selectedMethodPanel

                    if let statusMessage {
                        Label(statusMessage, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(DeliveraTheme.orange)
                            .padding(11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
    }

    private var paymentHeader: some View {
        HStack(spacing: 12) {
            DpointsGlyph(size: 30)
                .shadow(color: DeliveraTheme.orange.opacity(0.25), radius: 16, y: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text("Betalning")
                    .font(.system(size: 24, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                Text(priceText(state.total))
                    .font(.system(size: 18, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.orange)
            }
            Spacer()
            Button {
                UIApplication.shared.dismissKeyboard()
            } label: {
                Text("Klar")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 34)
                    .background(.white.opacity(0.9), in: Capsule())
            }
            .buttonStyle(.plain)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .frame(width: 40, height: 40)
                    .background(.white.opacity(0.9), in: Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var selectedMethodPanel: some View {
        NativeAdyenPaymentPanel(
            state: state,
            method: selectedMethod,
            isVerifying: $isVerifying,
            onCompleted: onCompleted,
            onVerify: onVerify,
            onFailed: { statusMessage = $0 }
        )
        .id(selectedMethod.rawValue)
    }
}

private enum NativePaymentMethod: String, CaseIterable, Identifiable {
    case card
    case applePay
    case klarna
    case swish

    var id: String { rawValue }

    static var availableMethods: [NativePaymentMethod] {
        [.card, .applePay, .klarna, .swish]
    }

    var title: String {
        switch self {
        case .card: return "Kort"
        case .applePay: return "Apple Pay"
        case .klarna: return "Klarna"
        case .swish: return "Swish"
        }
    }
    var symbol: String {
        switch self {
        case .card: return "creditcard.fill"
        case .applePay: return "apple.logo"
        case .klarna: return "sparkle"
        case .swish: return "bolt.fill"
        }
    }
    var heroSymbol: String { symbol }

    var adyenIdentifier: String {
        switch self {
        case .card: return "scheme"
        case .applePay: return "applepay"
        case .klarna: return "klarna"
        case .swish: return "swish"
        }
    }

    var shortDescription: String {
        switch self {
        case .card: return "Betala genom kort"
        case .applePay: return "Betala med Apple Pay"
        case .klarna: return "Betala nu eller senare"
        case .swish: return "Betala genom Swish"
        }
    }
}

private struct NativePaymentMethodButton: View {
    let method: NativePaymentMethod
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: method.symbol)
                    .font(.system(size: 17, weight: .black))
                Text(method.title)
                    .font(.system(size: 10.5, weight: .black))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundStyle(selected ? .white : DeliveraTheme.ink)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(selected ? DeliveraTheme.ink : .white, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(selected ? DeliveraTheme.orange.opacity(0.35) : DeliveraTheme.line, lineWidth: 1))
            .shadow(color: selected ? DeliveraTheme.orange.opacity(0.18) : .clear, radius: 16, y: 8)
        }
        .buttonStyle(.plain)
    }
}

private struct NativeAdyenPaymentPanel: View {
    let state: AdyenCheckoutState
    let method: NativePaymentMethod
    @Binding var isVerifying: Bool
    let onCompleted: () -> Void
    let onVerify: (String, String) async -> Result<Void, Error>
    let onFailed: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: method.heroSymbol)
                    .font(.system(size: 20, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(DeliveraTheme.orange, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(method.title)
                        .font(.system(size: 18, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(method.shortDescription)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
            }
            #if canImport(Adyen) && canImport(AdyenActions) && canImport(AdyenCard) && canImport(AdyenCheckout)
            AdyenNativePaymentComponent(
                state: state,
                method: method,
                isVerifying: $isVerifying,
                onVerify: onVerify,
                onCompleted: onCompleted,
                onFailed: onFailed
            )
            .frame(minHeight: method == .card ? 300 : 210)
            #else
            VStack(alignment: .leading, spacing: 10) {
                Text("Kortbetalning är inte tillgänglig just nu.")
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                Text("Försök igen om en stund.")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
                    .lineSpacing(2)
            }
            .padding(16)
            .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            #endif
        }
        .padding(12)
        .background(.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        .cardShadow()
    }
}

private struct EmptyCartFloatingBite: View {
    let symbol: String
    let phase: TimeInterval
    let x: CGFloat
    let y: CGFloat
    let tint: Color

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 20, weight: .black))
            .foregroundStyle(tint)
            .frame(width: 56, height: 56)
            .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
            .shadow(color: tint.opacity(0.14), radius: 16, y: 8)
            .rotationEffect(.degrees(sin(phase * 0.9) * 7))
            .offset(x: x + CGFloat(cos(phase * 0.7)) * 8, y: y + CGFloat(sin(phase * 0.9)) * 8)
    }
}

#if canImport(Adyen) && canImport(AdyenActions) && canImport(AdyenCard) && canImport(AdyenCheckout)
private struct AdyenNativePaymentComponent: UIViewControllerRepresentable {
    let state: AdyenCheckoutState
    let method: NativePaymentMethod
    @Binding var isVerifying: Bool
    let onVerify: (String, String) async -> Result<Void, Error>
    let onCompleted: () -> Void
    let onFailed: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            isVerifying: $isVerifying,
            method: method,
            onVerify: onVerify,
            onCompleted: onCompleted,
            onFailed: onFailed
        )
    }

    func makeUIViewController(context: Context) -> UIViewController {
        let controller = UIViewController()
        controller.view.backgroundColor = .clear
        context.coordinator.mount(in: controller, state: state)
        return controller
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, PresentationDelegate {
        @Binding var isVerifying: Bool
        let method: NativePaymentMethod
        let onVerify: (String, String) async -> Result<Void, Error>
        let onCompleted: () -> Void
        let onFailed: (String) -> Void
        private var checkout: SessionCheckout?
        private var component: CheckoutPaymentComponent?

        init(
            isVerifying: Binding<Bool>,
            method: NativePaymentMethod,
            onVerify: @escaping (String, String) async -> Result<Void, Error>,
            onCompleted: @escaping () -> Void,
            onFailed: @escaping (String) -> Void
        ) {
            _isVerifying = isVerifying
            self.method = method
            self.onVerify = onVerify
            self.onCompleted = onCompleted
            self.onFailed = onFailed
        }

        func mount(in parent: UIViewController, state: AdyenCheckoutState) {
            Task {
                do {
                    let amount = Amount(value: Int((state.total * 100).rounded()), currencyCode: "SEK", localeIdentifier: "sv_SE")
                    let configuration = try CheckoutConfiguration(
                        environment: AppConfig.adyenEnvironment.lowercased() == "live" ? .liveEurope : .test,
                        amount: amount,
                        clientKey: AppConfig.adyenClientKey
                    ) {
                        CardConfiguration()
                            .showCardholderName(true)
                            .showStorePaymentMethod(false)
                        AuthenticationConfiguration()
                            .requestorAppURL(URL(string: state.returnURL)!)
                    }

                    let sessionResponse = SessionResponse(id: state.session.id, sessionData: state.session.sessionData)
                    let checkout = try await Checkout.setup(
                        with: sessionResponse,
                        configuration: configuration,
                        presentationDelegate: self
                    )
                    .onComplete { [weak self] result in
                        guard let self else { return }
                        self.isVerifying = true
                        Task {
                            let verification = await self.onVerify(result.sessionId, result.sessionResult)
                            self.isVerifying = false
                            switch verification {
                            case .success:
                                self.onCompleted()
                            case .failure(let error):
                                self.onFailed(error.localizedDescription)
                            }
                        }
                    }
                    .onFailure { [weak self] error in
                        self?.onFailed(error.localizedDescription)
                    }
                    self.checkout = checkout

                    let paymentMethodType = PaymentMethodType(rawValue: method.adyenIdentifier) ?? .other(method.adyenIdentifier)
                    let component: CheckoutPaymentComponent
                    do {
                        component = try checkout.createPaymentComponent(for: paymentMethodType)
                    } catch {
                        onFailed("\(method.title) finns inte i den här Adyen iOS-sessionen. Kontrollera att \(method.title) är aktiverad för iOS/native i Adyen-testkontot och att merchant account får använda metoden i Sverige.")
                        return
                    }
                    self.component = component
                    guard let child = component.viewController else {
                        onFailed("Adyen kunde inte visa \(method.title) i native iOS. Kontrollera Adyen-konfigurationen för metoden.")
                        return
                    }
                    parent.addChild(child)
                    parent.view.addSubview(child.view)
                    child.view.translatesAutoresizingMaskIntoConstraints = false
                    NSLayoutConstraint.activate([
                        child.view.leadingAnchor.constraint(equalTo: parent.view.leadingAnchor),
                        child.view.trailingAnchor.constraint(equalTo: parent.view.trailingAnchor),
                        child.view.topAnchor.constraint(equalTo: parent.view.topAnchor),
                        child.view.bottomAnchor.constraint(equalTo: parent.view.bottomAnchor)
                    ])
                    child.didMove(toParent: parent)
                } catch {
                    onFailed(error.localizedDescription)
                }
            }
        }

        func present(component: PresentableComponent) {
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController }
                .first?
                .present(component.viewController, animated: true)
        }
    }
}
#endif
