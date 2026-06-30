import SwiftUI

enum DeliveraTheme {
    static let orange = Color(red: 0.94, green: 0.31, blue: 0.10)
    static let ink = Color(red: 0.06, green: 0.06, blue: 0.07)
    static let muted = Color(red: 0.43, green: 0.42, blue: 0.40)
    static let panel = Color.white
    static let line = Color.black.opacity(0.065)
    static let gold = Color(red: 0.94, green: 0.73, blue: 0.36)

    static var appBackground: some View {
        LinearGradient(
            colors: [
                Color(red: 0.99, green: 0.98, blue: 0.95),
                Color(red: 0.96, green: 0.98, blue: 0.96),
                Color(red: 0.99, green: 0.96, blue: 0.93)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

extension View {
    func cardShadow() -> some View {
        shadow(color: .black.opacity(0.075), radius: 18, x: 0, y: 10)
    }
}

struct DpointsGlyph: View {
    var size: CGFloat = 18

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
            .fill(DeliveraTheme.orange)
            .frame(width: size, height: size)
            .overlay {
                RoundedRectangle(cornerRadius: size * 0.1, style: .continuous)
                    .stroke(.white, lineWidth: max(1.5, size * 0.11))
                    .frame(width: size * 0.42, height: size * 0.42)
                    .rotationEffect(.degrees(45))
            }
    }
}

struct DpointsPriceBadge: View {
    let product: MenuProduct
    var valuePerKr: Double = 10
    var extrasTotal: Double = 0
    var quantity: Int = 1

    var body: some View {
        if product.rewardable == true {
            HStack(spacing: 5) {
                DpointsGlyph(size: 16)
                Text("\(product.dpointsUnitCost(valuePerKr: valuePerKr, extrasTotal: extrasTotal) * quantity) Dpoints")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(DeliveraTheme.orange)
            }
            .padding(.horizontal, 8)
            .frame(height: 26)
            .background(DeliveraTheme.orange.opacity(0.09), in: Capsule())
        }
    }
}
