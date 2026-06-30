import SwiftUI

struct RestaurantRail: View {
    let title: String
    let subtitle: String
    let restaurants: [Restaurant]
    let zoneRestaurants: [String: ZoneRestaurant]
    let orderMode: OrderMode
    let favorites: Set<String>
    var animationSeed = 0
    var entranceDirection: CGFloat = 1
    let onOpen: (Restaurant) -> Void
    let onToggleFavorite: (Restaurant) -> Void
    @State private var visible = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: title, subtitle: subtitle)
                .offset(x: visible ? 0 : entranceDirection * 36)
                .opacity(visible ? 1 : 0)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(restaurants.enumerated()), id: \.element.id) { index, restaurant in
                        RestaurantCard(
                            restaurant: restaurant,
                            width: 260,
                            zoneRestaurant: zoneRestaurants[restaurant.id] ?? zoneRestaurants[restaurant.slug],
                            orderMode: orderMode,
                            isFavorite: favorites.contains(restaurant.id),
                            onOpen: onOpen,
                            onToggleFavorite: onToggleFavorite
                        )
                        .offset(x: visible ? 0 : entranceDirection * CGFloat(96 + index * 10))
                        .opacity(visible ? 1 : 0)
                        .animation(.spring(response: 0.58, dampingFraction: 0.84).delay(Double(index) * 0.045), value: visible)
                    }
                }
                .padding(.trailing, 20)
            }
        }
        .onAppear { runEntrance() }
        .onChange(of: animationSeed) { _, _ in runEntrance() }
    }

    private func runEntrance() {
        visible = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
            withAnimation(.spring(response: 0.58, dampingFraction: 0.84)) {
                visible = true
            }
        }
    }
}

struct RestaurantList: View {
    let title: String
    let subtitle: String
    let restaurants: [Restaurant]
    let zoneRestaurants: [String: ZoneRestaurant]
    let orderMode: OrderMode
    let favorites: Set<String>
    var animationSeed = 0
    var entranceDirection: CGFloat = -1
    let onOpen: (Restaurant) -> Void
    let onToggleFavorite: (Restaurant) -> Void
    @State private var visible = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: title, subtitle: subtitle)
                .offset(x: visible ? 0 : entranceDirection * 36)
                .opacity(visible ? 1 : 0)
            ForEach(Array(restaurants.enumerated()), id: \.element.id) { index, restaurant in
                RestaurantCard(
                    restaurant: restaurant,
                    width: nil,
                    zoneRestaurant: zoneRestaurants[restaurant.id] ?? zoneRestaurants[restaurant.slug],
                    orderMode: orderMode,
                    isFavorite: favorites.contains(restaurant.id),
                    onOpen: onOpen,
                    onToggleFavorite: onToggleFavorite
                )
                .offset(x: visible ? 0 : entranceDirection * CGFloat(72 + min(index, 4) * 10))
                .opacity(visible ? 1 : 0)
                .animation(.spring(response: 0.56, dampingFraction: 0.86).delay(Double(min(index, 8)) * 0.035), value: visible)
            }
        }
        .onAppear { runEntrance() }
        .onChange(of: animationSeed) { _, _ in runEntrance() }
    }

    private func runEntrance() {
        visible = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            withAnimation(.spring(response: 0.56, dampingFraction: 0.86)) {
                visible = true
            }
        }
    }
}

struct RestaurantCard: View {
    let restaurant: Restaurant
    let width: CGFloat?
    let zoneRestaurant: ZoneRestaurant?
    let orderMode: OrderMode
    let isFavorite: Bool
    let onOpen: (Restaurant) -> Void
    let onToggleFavorite: (Restaurant) -> Void

    var body: some View {
        Button {
            guard RestaurantAvailability.isAccessible(restaurant) else { return }
            onOpen(restaurant)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .bottomLeading) {
                    if restaurant.hasImage {
                        RemoteImage(urlString: restaurant.heroImageUrl ?? restaurant.imageUrl, showsFailureIcon: false)
                            .frame(height: width == nil ? 178 : 142)
                            .frame(maxWidth: .infinity)
                            .background(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    } else {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(.white)
                            .frame(height: width == nil ? 178 : 142)
                    }

                    if RestaurantAvailability.isDimmed(restaurant) {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color.white.opacity(0.34))
                            .blendMode(.screen)
                            .allowsHitTesting(false)
                    }

                    availabilityBadge
                        .padding(12)

                    HStack {
                        Spacer()
                        Button {
                            onToggleFavorite(restaurant)
                        } label: {
                            Image(systemName: isFavorite ? "heart.fill" : "heart")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(DeliveraTheme.orange)
                                .frame(width: 34, height: 34)
                                .background(.white.opacity(0.94), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .padding(12)
                    }
                    .frame(maxHeight: .infinity, alignment: .top)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(restaurant.name)
                                .font(.system(size: 17, weight: .black, design: .rounded))
                                .foregroundStyle(DeliveraTheme.ink)
                                .lineLimit(1)
                            Text(restaurant.cuisine?.capitalized ?? restaurant.description ?? "Restaurang")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(DeliveraTheme.muted)
                                .lineLimit(1)
                        }
                        Spacer()
                        RatingBadge(value: restaurant.rating ?? 4.7)
                    }

                    HStack(spacing: 9) {
                        Metric(symbol: "clock.fill", text: "\(displayEtaMinutes) min")
                        Metric(symbol: orderMode.systemImage, text: feeText)
                        if let city = restaurant.city, !city.isEmpty {
                            Metric(symbol: "mappin.circle.fill", text: city)
                        }
                    }
                }
                .padding(14)
            }
            .frame(width: width)
            .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
            .opacity(RestaurantAvailability.isDimmed(restaurant) ? 0.68 : 1)
            .saturation(RestaurantAvailability.isDimmed(restaurant) ? 0.42 : 1)
            .grayscale(RestaurantAvailability.isDimmed(restaurant) ? 0.18 : 0)
            .cardShadow()
        }
        .buttonStyle(.plain)
        .disabled(restaurant.comingSoon == true)
    }

    @ViewBuilder
    private var availabilityBadge: some View {
        if let label = RestaurantAvailability.statusLabel(for: restaurant) {
            Label(label, systemImage: restaurant.comingSoon == true ? "sparkles" : "moon.fill")
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.black.opacity(0.78), in: Capsule())
        } else if orderMode == .pickup || displayDeliveryFee <= 0 {
            Text(orderMode == .pickup ? "Avhämtning" : "Fri leverans")
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(DeliveraTheme.orange, in: Capsule())
        }
    }

    private var feeText: String {
        if orderMode == .pickup { return "0 kr" }
        let fee = displayDeliveryFee
        return fee <= 0 ? "Gratis" : "\(Int(fee)) kr"
    }

    private var displayEtaMinutes: Int {
        zoneRestaurant?.matchedZone?.etaMinutes ?? zoneRestaurant?.etaMinutes ?? restaurant.etaMinutes ?? 30
    }

    private var displayDeliveryFee: Double {
        if orderMode == .pickup { return 0 }
        return zoneRestaurant?.matchedZone?.feeKr ?? zoneRestaurant?.deliveryFee.map { $0 / 100 } ?? restaurant.deliveryFee ?? 0
    }
}

struct RatingBadge: View {
    let value: Double

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "star.fill")
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(DeliveraTheme.gold)
            Text(String(format: "%.1f", value))
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 8)
        .frame(height: 26)
        .background(DeliveraTheme.ink, in: Capsule())
    }
}

struct Metric: View {
    let symbol: String
    let text: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .bold))
            Text(text)
                .font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(DeliveraTheme.ink.opacity(0.66))
        .lineLimit(1)
    }
}
