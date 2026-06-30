import SwiftUI

struct RewardsView: View {
    let authToken: String
    let onOpenProfile: () -> Void
    let onOpenRestaurant: (String, String?) -> Void

    @StateObject private var model = RewardsViewModel()
    @State private var hasAppeared = false
    @State private var selectedPanel: RewardsPanel = .shop

    private var isLoggedIn: Bool {
        !authToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    header

                    if isLoggedIn {
                        loggedInContent
                    } else {
                        guestContent
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 112)
                .opacity(hasAppeared ? 1 : 0)
                .offset(y: hasAppeared ? 0 : 22)
            }
            .refreshable {
                await model.load(authToken: authToken, forceRefresh: true)
            }
        }
        .task {
            withAnimation(.spring(response: 0.62, dampingFraction: 0.82)) {
                hasAppeared = true
            }
            await model.load(authToken: authToken)
        }
        .onChange(of: authToken) { _, newValue in
            Task { await model.load(authToken: newValue, forceRefresh: true) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Rewards")
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(DeliveraTheme.ink)
            Text(isLoggedIn ? "Tjäna poäng, köp reward-produkter och följ din historik." : "Se vilka rewards du låser upp när du loggar in.")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(DeliveraTheme.muted)
                .lineLimit(2)
        }
    }

    private var guestContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            RewardsHeroCard(balance: nil, title: "Poäng som blir mat", subtitle: "Samla Dpoints på beställningar, uppdrag och deals från Delivera.")

            Button(action: onOpenProfile) {
                HStack {
                    DpointsGlyph(size: 22)
                    Text("Registrera dig och börja samla")
                    Spacer()
                    Image(systemName: "arrow.right")
                }
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .frame(height: 58)
                .background(DeliveraTheme.orange, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .shadow(color: DeliveraTheme.orange.opacity(0.26), radius: 20, y: 10)
            }
            .buttonStyle(.plain)

            rewardsCatalog(locked: true)
        }
    }

    private var loggedInContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let signup = model.me?.signup, signup.claimable {
                Button {
                    Task { await model.claimSignupBonus(authToken: authToken) }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 20, weight: .black))
                            .frame(width: 42, height: 42)
                            .background(.white.opacity(0.17), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Hämta din välkomstbonus")
                                .font(.system(size: 15, weight: .black))
                            Text("+\(signup.bonusPoints) Dpoints väntar på dig")
                                .font(.system(size: 12, weight: .bold))
                                .opacity(0.78)
                        }
                        Spacer()
                        if model.isClaiming {
                            ProgressView().tint(.white)
                        } else {
                            Text("Hämta")
                                .font(.system(size: 12, weight: .black))
                                .padding(.horizontal, 12)
                                .frame(height: 34)
                                .background(.white.opacity(0.16), in: Capsule())
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(16)
                    .background(Color(red: 0.17, green: 0.49, blue: 0.31), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            RewardsHeroCard(
                balance: model.me?.balance,
                title: "\(model.me?.balance ?? 0) Dpoints",
                subtitle: "Använd poäng direkt på markerade produkter."
            )

            panelPicker

            switch selectedPanel {
            case .shop:
                rewardsCatalog(locked: false)
            case .earn:
                earnRules
            case .history:
                history
            }
        }
    }

    private var panelPicker: some View {
        HStack(spacing: 8) {
            ForEach(RewardsPanel.allCases) { panel in
                Button {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                        selectedPanel = panel
                    }
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: panel.symbol)
                        Text(panel.title)
                    }
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(selectedPanel == panel ? .white : DeliveraTheme.ink)
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .background(selectedPanel == panel ? DeliveraTheme.ink : .white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func rewardsCatalog(locked: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle(title: "Köp med poäng", subtitle: model.catalogSubtitle)

            if model.isLoading && model.rewardRestaurants.isEmpty {
                RewardsLoadingShowcase()
            } else if model.rewardRestaurants.isEmpty {
                EmptyRewardsCard()
            } else {
                ForEach(model.rewardRestaurants) { restaurant in
                    RewardRestaurantBlock(
                        restaurant: restaurant,
                        balance: model.me?.balance ?? 0,
                        locked: locked,
                        onOpenRestaurant: onOpenRestaurant
                    )
                }
            }
        }
    }

    private var earnRules: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "Tjäna poäng", subtitle: "Köp ger poäng tillbaka. Uppdrag ger extra.")
            ForEach(model.earnRules) { rule in
                HStack(spacing: 12) {
                    Image(systemName: rule.symbol)
                        .font(.system(size: 18, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 42, height: 42)
                        .background(DeliveraTheme.orange, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(rule.label)
                            .font(.system(size: 15, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                        Text(rule.repeatLabel ?? "Kan tjänas i appen")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                    }
                    Spacer()
                    Text("+\(rule.points) p")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 11)
                        .frame(height: 30)
                        .background(DeliveraTheme.ink, in: Capsule())
                }
                .padding(14)
                .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
            }
        }
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "Historik", subtitle: "Senaste Dpoints-rörelser")
            let transactions = model.me?.transactions ?? []
            if transactions.isEmpty {
                Text("Ingen historik än.")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                ForEach(transactions.prefix(10)) { tx in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tx.displayTitle)
                                .font(.system(size: 14, weight: .black))
                                .foregroundStyle(DeliveraTheme.ink)
                            Text(tx.createdAt.prefix(10))
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                        }
                        Spacer()
                        Text("\(tx.amount >= 0 ? "+" : "")\(tx.amount)")
                            .font(.system(size: 14, weight: .black))
                            .foregroundStyle(tx.amount >= 0 ? DeliveraTheme.orange : DeliveraTheme.muted)
                    }
                    .padding(14)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                }
            }
        }
    }
}

@MainActor
private final class RewardsViewModel: ObservableObject {
    @Published var me: RewardsMe?
    @Published var earnRules: [RewardsEarnRule] = []
    @Published var rewardRestaurants: [RewardRestaurant] = []
    @Published var isLoading = false
    @Published var isClaiming = false

    var catalogSubtitle: String {
        let count = rewardRestaurants.reduce(0) { $0 + $1.products.count }
        return count > 0 ? "\(count) produkter från restaurangerna" : "Rewardable produkter visas här när de är aktiva."
    }

    func load(authToken: String, forceRefresh: Bool = false) async {
        let token = authToken.trimmingCharacters(in: .whitespacesAndNewlines)
        let isLoggedIn = !token.isEmpty
        isLoading = true
        defer { isLoading = false }

        async let catalogTask = loadCatalog(forceRefresh: forceRefresh)
        async let rewardsTask = loadRewards()
        async let meTask: RewardsMe? = isLoggedIn ? try? DeliveraAPI().dpointsMeDetailed(token: token) : nil

        let catalog = await catalogTask
        let rewards = await rewardsTask
        rewardRestaurants = catalog?.restaurants ?? []
        earnRules = rewards?.earnRules ?? []
        if isLoggedIn {
            me = await meTask
        } else {
            me = nil
        }
    }

    func claimSignupBonus(authToken: String) async {
        let token = authToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { return }
        isClaiming = true
        defer { isClaiming = false }
        me = try? await DeliveraAPI().claimDpointsSignupBonusDetailed(token: token)
    }

    private func loadCatalog(forceRefresh: Bool) async -> DpointsRewardProductsResponse? {
        if let response = try? await DeliveraAPI().dpointsRewardProducts(forceRefresh: forceRefresh), !response.restaurants.isEmpty || forceRefresh {
            return response
        }
        return try? await DeliveraAPI().dpointsRewardProducts(forceRefresh: true)
    }

    private func loadRewards() async -> DpointsRewardsResponse? {
        try? await DeliveraAPI().dpointsRewards()
    }
}

private struct RewardsHeroCard: View {
    let balance: Int?
    let title: String
    let subtitle: String

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            ZStack(alignment: .leading) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .stroke(.white.opacity(0.09), lineWidth: 1.5)
                        .frame(width: CGFloat(118 + index * 74), height: CGFloat(118 + index * 74))
                        .scaleEffect(1 + 0.035 * sin(t * 0.9 + Double(index)))
                        .offset(x: CGFloat(210 - index * 14), y: CGFloat(-18 + index * 20))
                }

                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [.clear, .white.opacity(0.22), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 76)
                    .rotationEffect(.degrees(18))
                    .offset(x: CGFloat((sin(t * 0.45) + 1) * 180 - 48))
                    .blur(radius: 10)

                ForEach(0..<7, id: \.self) { index in
                    DpointsGlyph(size: CGFloat(18 + index * 4))
                        .opacity(0.11 + Double(index % 2) * 0.06)
                        .rotationEffect(.degrees(t * 24 + Double(index) * 24))
                        .offset(
                            x: CGFloat(cos(t * 0.7 + Double(index))) * CGFloat(98 + index * 8) + 194,
                            y: CGFloat(sin(t * 0.95 + Double(index))) * CGFloat(34 + index * 6)
                        )
                }

                VStack(alignment: .leading, spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(.white.opacity(0.16))
                            .frame(width: 62, height: 62)
                            .scaleEffect(1 + 0.04 * sin(t * 1.1))
                        DpointsGlyph(size: 42)
                            .rotationEffect(.degrees(sin(t * 0.7) * 7))
                            .shadow(color: .white.opacity(0.28), radius: 18, y: 8)
                    }
                    Text(balance == nil ? title : "\(balance ?? 0)")
                        .font(.system(size: balance == nil ? 30 : 46, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                    Text(balance == nil ? subtitle : "Dpoints")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white.opacity(0.78))
                    if balance != nil {
                        Text(subtitle)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.72))
                    }
                }
                .padding(22)
            }
            .frame(maxWidth: .infinity, minHeight: 188, alignment: .leading)
            .background(
                LinearGradient(
                    colors: [DeliveraTheme.orange, Color(red: 0.08, green: 0.08, blue: 0.09)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 26, style: .continuous)
            )
            .shadow(color: DeliveraTheme.orange.opacity(0.25), radius: 28, y: 16)
        }
    }
}

private struct RewardRestaurantBlock: View {
    let restaurant: RewardRestaurant
    let balance: Int
    let locked: Bool
    let onOpenRestaurant: (String, String?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                onOpenRestaurant(restaurant.slug, nil)
            } label: {
                HStack(spacing: 10) {
                    RemoteImage(urlString: restaurant.logoUrl ?? restaurant.imageUrl, contentMode: .fill, showsFailureIcon: false)
                        .frame(width: 38, height: 38)
                        .background(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(restaurant.name)
                            .font(.system(size: 15, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                            .lineLimit(1)
                        Text("\(restaurant.cuisine ?? "Rewards") - välj produkt i menyn")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                            .lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.muted)
                }
            }
            .buttonStyle(.plain)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(restaurant.products) { product in
                        let affordable = !locked && balance >= product.pointsPrice
                        Button {
                            onOpenRestaurant(restaurant.slug, product.categoryId)
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                ZStack(alignment: .topTrailing) {
                                    if product.hasImage {
                                        RemoteImage(urlString: product.imageUrl, contentMode: .fit, showsFailureIcon: false)
                                            .frame(height: 116)
                                            .frame(maxWidth: .infinity)
                                            .background(.white)
                                    } else {
                                        Rectangle()
                                            .fill(Color.white)
                                            .frame(height: 56)
                                    }
                                    if locked || !affordable {
                                        Image(systemName: locked ? "lock.fill" : "exclamationmark.lock.fill")
                                            .font(.system(size: 12, weight: .black))
                                            .foregroundStyle(.white)
                                            .frame(width: 26, height: 26)
                                            .background(.black.opacity(0.72), in: Circle())
                                            .padding(8)
                                    }
                                }
                                Text(product.name)
                                    .font(.system(size: 14, weight: .black))
                                    .foregroundStyle(DeliveraTheme.ink)
                                    .lineLimit(1)
                                HStack(spacing: 6) {
                                    DpointsGlyph(size: 18)
                                    Text("\(product.pointsPrice) p")
                                        .font(.system(size: 12, weight: .black))
                                        .foregroundStyle(DeliveraTheme.orange)
                                    Spacer()
                                    Text(priceText(product.price))
                                        .font(.system(size: 11, weight: .black))
                                        .foregroundStyle(DeliveraTheme.muted)
                                }
                            }
                            .padding(10)
                            .frame(width: 154, height: 220, alignment: .topLeading)
                            .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(affordable || locked ? DeliveraTheme.line : DeliveraTheme.line.opacity(0.6), lineWidth: 1))
                            .opacity(locked ? 0.55 : affordable ? 1 : 0.62)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.trailing, 20)
            }
        }
    }
}

private struct SectionTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 20, weight: .black, design: .rounded))
                .foregroundStyle(DeliveraTheme.ink)
            Text(subtitle)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(DeliveraTheme.muted)
        }
    }
}

private struct RewardsSkeletonRail: View {
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(0..<3, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 10) {
                        RoundedRectangle(cornerRadius: 15).fill(Color.black.opacity(0.04)).frame(height: 116)
                        RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.05)).frame(width: 102, height: 13)
                        RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.04)).frame(width: 74, height: 12)
                    }
                    .padding(10)
                    .frame(width: 154, height: 220, alignment: .topLeading)
                    .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                }
            }
        }
    }
}

private struct RewardsLoadingShowcase: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            RewardsLoadingHeader()

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(0..<4, id: \.self) { index in
                        RewardsLoadingProductCard(index: index)
                    }
                }
                .padding(.trailing, 20)
            }

            VStack(spacing: 10) {
                ForEach(0..<2, id: \.self) { index in
                    RewardsLoadingRestaurantRow(index: index)
                }
            }
        }
    }
}

private struct RewardsLoadingHeader: View {
    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(DeliveraTheme.orange.opacity(0.14))
                        .frame(width: 48, height: 48)
                        .scaleEffect(1 + 0.05 * sin(t * 1.2))
                    DpointsGlyph(size: 24)
                        .rotationEffect(.degrees(t * 12))
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Hämtar rewards")
                        .font(.system(size: 17, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text("Vi laddar restauranger och poängprodukter.")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
                Spacer()
                ProgressView()
                    .tint(DeliveraTheme.orange)
            }
            .padding(15)
            .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
    }
}

private struct RewardsLoadingProductCard: View {
    let index: Int

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            VStack(alignment: .leading, spacing: 10) {
                ShimmerBlock(cornerRadius: 16, opacity: 0.08, phase: t + Double(index) * 0.18)
                    .frame(height: 116)
                ShimmerBlock(cornerRadius: 6, opacity: 0.08, phase: t + Double(index) * 0.18)
                    .frame(width: 108, height: 14)
                HStack(spacing: 7) {
                    DpointsGlyph(size: 16)
                        .opacity(0.72)
                    ShimmerBlock(cornerRadius: 6, opacity: 0.07, phase: t + Double(index) * 0.18)
                        .frame(width: 58, height: 12)
                }
            }
            .padding(10)
            .frame(width: 154, height: 220, alignment: .topLeading)
            .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
            .offset(y: CGFloat(sin(t * 0.8 + Double(index))) * 2)
        }
    }
}

private struct RewardsLoadingRestaurantRow: View {
    let index: Int

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate + Double(index) * 0.24
            HStack(spacing: 12) {
                ShimmerBlock(cornerRadius: 13, opacity: 0.08, phase: t)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 8) {
                    ShimmerBlock(cornerRadius: 6, opacity: 0.08, phase: t)
                        .frame(width: 142, height: 14)
                    ShimmerBlock(cornerRadius: 6, opacity: 0.06, phase: t)
                        .frame(width: 198, height: 12)
                }
                Spacer()
                DpointsGlyph(size: 20)
                    .opacity(0.24 + 0.08 * sin(t))
            }
            .padding(14)
            .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
    }
}

private struct ShimmerBlock: View {
    let cornerRadius: CGFloat
    let opacity: Double
    let phase: TimeInterval

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.black.opacity(opacity))
            .overlay {
                GeometryReader { proxy in
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.clear, .white.opacity(0.52), .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(width: proxy.size.width * 0.45)
                        .rotationEffect(.degrees(16))
                        .offset(x: CGFloat((sin(phase * 1.1) + 1) * 0.5) * proxy.size.width * 1.4 - proxy.size.width * 0.45)
                        .blur(radius: 8)
                }
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            }
    }
}

private struct EmptyRewardsCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Inga produkter ännu")
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)
            Text("När en restaurang markerar produkter som rewardable i admin visas de här.")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(DeliveraTheme.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private enum RewardsPanel: String, CaseIterable, Identifiable {
    case shop
    case earn
    case history

    var id: String { rawValue }
    var title: String {
        switch self {
        case .shop: return "Köp"
        case .earn: return "Tjäna"
        case .history: return "Historik"
        }
    }
    var symbol: String {
        switch self {
        case .shop: return "bag.fill"
        case .earn: return "sparkles"
        case .history: return "clock.fill"
        }
    }
}

struct DpointsRewardsResponse: Decodable {
    let enabled: Bool?
    let valuePerKr: Double?
    let rewards: [LegacyDpointsReward]?
    let earnRules: [RewardsEarnRule]
    let streakTarget: Int?
}

struct DpointsRewardProductsResponse: Decodable {
    let enabled: Bool?
    let earnRate: Double?
    let restaurants: [RewardRestaurant]
}

struct RewardsMe: Decodable {
    let enabled: Bool
    let balance: Int
    let valuePerKr: Double
    let signup: SignupBonus?
    let streak: Streak?
    let transactions: [DpointsTransaction]

    struct SignupBonus: Decodable {
        let claimable: Bool
        let bonusPoints: Int
        let sponsorName: String?
    }

    struct Streak: Decodable {
        let target: Int
        let count: Int
        let ready: Bool
        let readyInDays: Int
    }
}

struct RewardsEarnRule: Decodable, Identifiable {
    let key: String
    let label: String
    let points: Int
    let repeatLabel: String?

    var id: String { key }
    var symbol: String {
        switch key {
        case "invite": return "person.badge.plus"
        case "order_streak": return "repeat"
        case "new_restaurant": return "storefront"
        case "review_rating": return "star.fill"
        case "review_text": return "square.and.pencil"
        default: return "diamond.fill"
        }
    }

    private enum CodingKeys: String, CodingKey {
        case key
        case label
        case points
        case repeatLabel = "repeat"
    }
}

struct RewardRestaurant: Decodable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let cuisine: String?
    let imageUrl: String?
    let logoUrl: String?
    let products: [RewardProduct]
}

struct RewardProduct: Decodable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let price: Double
    let imageUrl: String?
    let categoryId: String?
    let categoryName: String?
    let pointsPrice: Int
    let multiplier: Double?
    let tier: RewardTier?

    var hasImage: Bool {
        guard let imageUrl else { return false }
        return !imageUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct RewardTier: Decodable {
    let key: String
    let label: String
    let rank: Int
}

struct LegacyDpointsReward: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let pointsCost: Int
}

struct DpointsTransaction: Decodable, Identifiable {
    let id: String
    let amount: Int
    let type: String
    let reason: String?
    let balanceAfter: Int
    let createdAt: String

    var displayTitle: String {
        if let reason, !reason.isEmpty { return reason }
        switch type {
        case "EARN_ORDER": return "Köp"
        case "SIGNUP_BONUS": return "Välkomstbonus"
        case "CAMPAIGN": return "Kampanj"
        case "REDEEM": return "Inlöst"
        case "ADMIN_ADJUST": return "Justering"
        case "REVERSAL": return "Återtag"
        default: return type
        }
    }
}
