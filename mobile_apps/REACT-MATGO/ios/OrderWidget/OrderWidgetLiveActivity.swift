//
//  OrderWidgetLiveActivity.swift
//  OrderWidget
//

import ActivityKit
import SwiftUI
import WidgetKit

// ── FoodGo colours ────────────────────────────────────────────────────────────
private extension Color {
    static let fgBg    = Color(red: 0.04, green: 0.04, blue: 0.06)
    static let fgGold  = Color(red: 0.91, green: 0.70, blue: 0.29)
    static let fgMuted = Color(red: 0.62, green: 0.59, blue: 0.55)
    static let fgText  = Color(red: 0.96, green: 0.95, blue: 0.93)
    static let fgPanel = Color(red: 0.11, green: 0.10, blue: 0.14)
}

private let stepLabels = ["Mottagen", "Tillagas", "På väg", "Framme", "Klar"]
private let stepIcons: [String] = [
    "checkmark.circle", "flame", "bicycle", "mappin.circle", "bag.badge.checkmark"
]

// Per-step accent colors: accepted→gold, preparing→orange, on-way→green, arrived→blue, done→mint
private let stepColors: [Color] = [
    Color(red: 0.91, green: 0.70, blue: 0.29), // Mottagen  – gold
    Color(red: 1.00, green: 0.50, blue: 0.10), // Tillagas  – orange
    Color(red: 0.20, green: 0.85, blue: 0.45), // På väg    – green
    Color(red: 0.25, green: 0.65, blue: 1.00), // Framme    – blue
    Color(red: 0.10, green: 0.95, blue: 0.55), // Klar      – mint
]

// ── Expanded lock-screen / banner ─────────────────────────────────────────────
struct OrderExpandedView: View {
    let context: ActivityViewContext<OrderActivityAttributes>

    var body: some View {
        let state  = context.state
        let step   = min(max(state.progressStep, 0), 4)
        let accent = stepColors[step]

        VStack(spacing: 12) {
            HStack {
                Image(systemName: "fork.knife")
                    .foregroundStyle(accent)
                Text("FoodGo")
                    .font(.system(size: 16, weight: .black))
                    .italic()
                    .foregroundStyle(accent)
                Spacer()
                Text(context.attributes.orderTotal)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.fgText)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(context.attributes.restaurantName)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Color.fgText)
                Text(state.statusText)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.fgMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Progress row
            HStack(spacing: 0) {
                ForEach(0..<5) { i in
                    VStack(spacing: 4) {
                        ZStack {
                            Circle()
                                .fill(i <= step ? stepColors[i] : Color.fgPanel)
                                .frame(width: 26, height: 26)
                            Image(systemName: stepIcons[i])
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(i <= step ? Color.fgBg : Color.fgMuted)
                        }
                        Text(stepLabels[i])
                            .font(.system(size: 8, weight: i == step ? .bold : .regular))
                            .foregroundStyle(i == step ? stepColors[i] : Color.fgMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    if i < 4 {
                        Rectangle()
                            .fill(i < step ? stepColors[i] : Color.fgPanel)
                            .frame(height: 2)
                            .frame(maxWidth: .infinity)
                            .padding(.bottom, 18)
                    }
                }
            }

            if let eta = state.etaMinutes, step < 4 {
                HStack {
                    Image(systemName: "clock")
                        .foregroundStyle(Color.fgMuted)
                        .font(.system(size: 11))
                    Text("Beräknad tid: ~\(eta) min")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.fgMuted)
                    Spacer()
                }
            }
        }
        .padding(16)
        .background(Color.fgBg)
    }
}

// ── Widget ────────────────────────────────────────────────────────────────────
struct OrderWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OrderActivityAttributes.self) { context in
            OrderExpandedView(context: context)
                .activityBackgroundTint(Color.fgBg)

        } dynamicIsland: { context in
            let step   = min(max(context.state.progressStep, 0), 4)
            let accent = stepColors[step]

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "fork.knife")
                            .foregroundStyle(accent)
                        Text("FoodGo")
                            .font(.system(size: 14, weight: .black))
                            .italic()
                            .foregroundStyle(accent)
                    }
                    .padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let eta = context.state.etaMinutes, step < 4 {
                        Text("~\(eta) min")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(accent)
                            .padding(.trailing, 8)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    OrderExpandedView(context: context)
                }
            } compactLeading: {
                Image(systemName: stepIcons[step])
                    .foregroundStyle(accent)
                    .font(.system(size: 14, weight: .semibold))
            } compactTrailing: {
                Text(stepLabels[step])
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            } minimal: {
                Image(systemName: stepIcons[step])
                    .foregroundStyle(accent)
            }
            .widgetURL(URL(string: "foodgo://order/\(context.attributes.orderId)"))
            .keylineTint(accent)
        }
    }
}
