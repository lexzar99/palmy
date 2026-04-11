import ActivityKit
import WidgetKit
import SwiftUI

// ── Brand colours ─────────────────────────────────────────────────────────────
private let gold     = Color(red: 212/255, green: 160/255, blue: 23/255)
private let darkBg   = Color(red: 13/255,  green: 12/255,  blue: 20/255)
private let surface  = Color(red: 25/255,  green: 24/255,  blue: 35/255)

// ── Widget Configuration ───────────────────────────────────────────────────────
struct MatgoOrderActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OrderDeliveryAttributes.self) { context in
            // ── Lock Screen / Notification Center ──────────────────────────────
            LockScreenOrderView(context: context)
                .activityBackgroundTint(darkBg)
                .activitySystemActionForegroundColor(.white)

        } dynamicIsland: { context in
            DynamicIsland {

                // ── Expanded (long press) ──────────────────────────────────────
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 10) {
                        // Restaurant initial bubble
                        Text(String(context.attributes.restaurantName.prefix(1)))
                            .font(.system(size: 20, weight: .black, design: .rounded))
                            .foregroundColor(gold)
                            .frame(width: 38, height: 38)
                            .background(gold.opacity(0.15))
                            .clipShape(Circle())

                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.attributes.restaurantName)
                                .font(.system(size: 14, weight: .black))
                                .foregroundColor(.white)
                                .lineLimit(1)
                            Text(context.state.statusText)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white.opacity(0.55))
                                .lineLimit(1)
                        }
                    }
                    .padding(.leading, 6)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let eta = context.state.etaMinutes,
                           context.state.status != "delivered",
                           context.state.status != "cancelled" {
                            Text("\(eta)")
                                .font(.system(size: 26, weight: .black, design: .rounded))
                                .foregroundColor(gold)
                            Text("MIN")
                                .font(.system(size: 8, weight: .black))
                                .foregroundColor(.white.opacity(0.4))
                                .tracking(2)
                        } else {
                            statusSymbol(context.state.status, size: 22)
                        }
                    }
                    .padding(.trailing, 6)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        // Progress bar
                        OrderProgressBar(step: context.state.progressStep)
                        // Total
                        HStack {
                            Text("Order")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.white.opacity(0.35))
                            Spacer()
                            Text(context.attributes.orderTotal)
                                .font(.system(size: 10, weight: .black))
                                .foregroundColor(gold)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 6)
                }

            } compactLeading: {
                // ── Compact leading (small pill left) ─────────────────────────
                Text(String(context.attributes.restaurantName.prefix(1)))
                    .font(.system(size: 15, weight: .black, design: .rounded))
                    .foregroundColor(gold)
                    .frame(width: 22)

            } compactTrailing: {
                // ── Compact trailing (small pill right) ───────────────────────
                if let eta = context.state.etaMinutes,
                   context.state.status != "delivered",
                   context.state.status != "cancelled" {
                    Text("\(eta)m")
                        .font(.system(size: 13, weight: .black, design: .rounded))
                        .foregroundColor(gold)
                        .minimumScaleFactor(0.8)
                } else {
                    statusSymbol(context.state.status, size: 14)
                }

            } minimal: {
                // ── Minimal (tiny circle when multiple activities) ─────────────
                statusSymbol(context.state.status, size: 14)
            }
            .widgetURL(URL(string: "matgo://order/\(context.attributes.orderId)"))
            .keylineTint(gold)
        }
    }

    @ViewBuilder
    private func statusSymbol(_ status: String, size: CGFloat) -> some View {
        switch status {
        case "delivered":
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: size, weight: .bold))
                .foregroundColor(.green)
        case "on_the_way", "arrived":
            Image(systemName: "bicycle")
                .font(.system(size: size - 2, weight: .bold))
                .foregroundColor(.cyan)
        case "cancelled":
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: size, weight: .bold))
                .foregroundColor(.red)
        default: // accepted, preparing
            Image(systemName: "flame.fill")
                .font(.system(size: size - 2, weight: .bold))
                .foregroundColor(gold)
        }
    }
}

// ── Lock Screen / Notification Centre view ────────────────────────────────────
struct LockScreenOrderView: View {
    let context: ActivityViewContext<OrderDeliveryAttributes>

    var body: some View {
        HStack(spacing: 14) {
            // Left: restaurant initial
            ZStack {
                Circle()
                    .fill(gold.opacity(0.15))
                    .frame(width: 50, height: 50)
                Text(String(context.attributes.restaurantName.prefix(1)))
                    .font(.system(size: 22, weight: .black, design: .rounded))
                    .foregroundColor(gold)
            }

            // Centre: status info
            VStack(alignment: .leading, spacing: 3) {
                Text(context.attributes.restaurantName.uppercased())
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text(context.state.statusText)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                    .lineLimit(1)
                OrderProgressBar(step: context.state.progressStep)
                    .frame(height: 4)
            }

            Spacer()

            // Right: ETA
            if let eta = context.state.etaMinutes,
               context.state.status != "delivered",
               context.state.status != "cancelled" {
                VStack(spacing: 1) {
                    Text("\(eta)")
                        .font(.system(size: 24, weight: .black, design: .rounded))
                        .foregroundColor(gold)
                    Text("MIN")
                        .font(.system(size: 8, weight: .black))
                        .foregroundColor(.white.opacity(0.4))
                        .tracking(2)
                }
            }
        }
        .padding(16)
    }
}

// ── Progress bar (4 steps) ────────────────────────────────────────────────────
struct OrderProgressBar: View {
    let step: Int  // 0=accepted, 1=preparing, 2=on_the_way, 3=arrived, 4=delivered

    private let labels = ["✓", "🍳", "🚴", "📍", "✅"]
    private let gold   = Color(red: 212/255, green: 160/255, blue: 23/255)

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<4) { i in
                Capsule()
                    .fill(i < step ? gold : Color.white.opacity(0.15))
                    .frame(height: 3)
            }
        }
    }
}
