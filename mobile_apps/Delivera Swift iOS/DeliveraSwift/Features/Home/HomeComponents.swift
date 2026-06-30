import SwiftUI

enum OrderMode: String, CaseIterable, Identifiable {
    case delivery
    case pickup

    var id: String { rawValue }
    var title: String { self == .delivery ? "Delivery" : "Pickup" }
    var systemImage: String { self == .delivery ? "bolt.car.fill" : "figure.walk" }
}

struct HomeHeader: View {
    let address: String
    let favoriteCount: Int
    @Binding var mode: OrderMode
    @Binding var searchQuery: String
    let onAddressTap: () -> Void
    let onFavoritesTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Button(action: onAddressTap) {
                    HStack(spacing: 12) {
                        Image(systemName: "location.fill")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(DeliveraTheme.orange)
                            .frame(width: 42, height: 42)
                            .background(DeliveraTheme.orange.opacity(0.12), in: Circle())

                        VStack(alignment: .leading, spacing: 2) {
                            Text(mode == .delivery ? "DELIVER TO" : "PICKUP IN")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                            HStack(spacing: 5) {
                                Text(address)
                                    .font(.system(size: 15, weight: .black, design: .rounded))
                                    .foregroundStyle(DeliveraTheme.ink)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.76)
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(DeliveraTheme.ink.opacity(0.7))
                            }
                        }
                    }
                }
                .buttonStyle(.plain)

                Spacer()

                IconButton(systemImage: favoriteCount > 0 ? "heart.fill" : "heart", badgeCount: favoriteCount, action: onFavoritesTap)
            }

            HStack(spacing: 8) {
                ForEach(OrderMode.allCases) { item in
                    Button {
                        mode = item
                    } label: {
                        HStack(spacing: 7) {
                            Image(systemName: item.systemImage)
                                .font(.system(size: 13, weight: .bold))
                            Text(item.title)
                                .font(.system(size: 14, weight: .bold))
                        }
                        .foregroundStyle(mode == item ? .white : DeliveraTheme.ink.opacity(0.62))
                        .frame(maxWidth: .infinity)
                        .frame(height: 42)
                        .background(mode == item ? DeliveraTheme.ink : Color.white.opacity(0.72), in: Capsule())
                        .overlay(Capsule().stroke(DeliveraTheme.line, lineWidth: mode == item ? 0 : 1))
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)
                TextField("Sök restaurang, sushi, pizza...", text: $searchQuery)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(DeliveraTheme.ink)
                if !searchQuery.isEmpty {
                    Button {
                        searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                } else {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(DeliveraTheme.ink)
                }
            }
            .padding(.horizontal, 15)
            .frame(height: 50)
            .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
            .cardShadow()
        }
    }
}

struct IconButton: View {
    let systemImage: String
    var badgeCount = 0
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(systemImage.contains("heart.fill") ? DeliveraTheme.orange : DeliveraTheme.ink)
                    .frame(width: 42, height: 42)
                    .background(.white.opacity(0.94), in: Circle())
                    .cardShadow()
                if badgeCount > 0 {
                    Text(badgeCount > 99 ? "99+" : "\(badgeCount)")
                        .font(.system(size: 9, weight: .black))
                        .foregroundStyle(.white)
                        .frame(minWidth: 17, minHeight: 17)
                        .padding(.horizontal, 4)
                        .background(DeliveraTheme.orange, in: Capsule())
                        .offset(x: 3, y: -4)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

struct SectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 22, weight: .black, design: .rounded))
                .foregroundStyle(DeliveraTheme.ink)
            Text(subtitle)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(DeliveraTheme.muted)
        }
    }
}

struct CuisineChips: View {
    let cuisines: [String]
    @Binding var selected: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(cuisines, id: \.self) { cuisine in
                    Button {
                        selected = cuisine
                    } label: {
                        Text(cuisine)
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(selected == cuisine ? .white : DeliveraTheme.ink)
                            .padding(.horizontal, 14)
                            .frame(height: 38)
                            .background(selected == cuisine ? DeliveraTheme.orange : .white, in: Capsule())
                            .overlay(Capsule().stroke(DeliveraTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct NoticeBanner: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "wifi.exclamationmark")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(DeliveraTheme.orange)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(DeliveraTheme.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
