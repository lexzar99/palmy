//
//  OrderWidgetLiveActivity.swift
//  OrderWidget
//
//  Step-based Live Activity:
//    DELIVERY (3 steps): Mottagen → Tillagas (timer) → På väg (timer)
//    PICKUP   (3 steps): Mottagen → Tillagas (timer) → Redo att hämtas
//
//  There is no "Levererad" step — iOS' frequent-updates throttle made the
//  late state change to a 4th step unreliable, so the LA is dismissed the
//  moment the order is delivered instead.
//

import ActivityKit
import SwiftUI
import WidgetKit

// ── FoodGo palette ────────────────────────────────────────────────────────────
private extension Color {
    static let fgBg     = Color(red: 0.05, green: 0.04, blue: 0.07)
    static let fgPanel  = Color(red: 0.10, green: 0.09, blue: 0.13)
    static let fgGold   = Color(red: 0.91, green: 0.70, blue: 0.29)
    static let fgMuted  = Color(red: 0.62, green: 0.59, blue: 0.55)
    static let fgText   = Color(red: 0.97, green: 0.96, blue: 0.94)
    static let fgGreen  = Color(red: 0.20, green: 0.85, blue: 0.45)
    static let fgOrange = Color(red: 1.00, green: 0.50, blue: 0.10)
    static let fgMint   = Color(red: 0.10, green: 0.95, blue: 0.55)
    static let fgBlue   = Color(red: 0.25, green: 0.65, blue: 1.00)
}

// ── Step model ────────────────────────────────────────────────────────────────
private struct StepDef {
    let label: String
    let icon: String
    let color: Color
    /// Whether this step shows a live countdown when active.
    let showsTimer: Bool
}

private func steps(for orderType: String?) -> [StepDef] {
    let isPickup = orderType == "PICKUP"
    if isPickup {
        return [
            StepDef(label: "Mottagen",  icon: "checkmark.circle.fill", color: .fgGold,   showsTimer: false),
            StepDef(label: "Tillagas",  icon: "flame.fill",            color: .fgOrange, showsTimer: true),
            StepDef(label: "Redo",      icon: "bag.badge.checkmark",   color: .fgMint,   showsTimer: false),
        ]
    }
    return [
        StepDef(label: "Mottagen",  icon: "checkmark.circle.fill", color: .fgGold,   showsTimer: false),
        StepDef(label: "Tillagas",  icon: "flame.fill",            color: .fgOrange, showsTimer: true),
        StepDef(label: "På väg",    icon: "bicycle",               color: .fgGreen,  showsTimer: true),
    ]
}

private func clampStep(_ step: Int, count: Int) -> Int {
    return max(0, min(step, count - 1))
}

// ── Countdown helpers ─────────────────────────────────────────────────────────
private struct CountdownText: View {
    let endsAt: Double
    let accent: Color

    var body: some View {
        let date = Date(timeIntervalSince1970: endsAt)
        // SwiftUI auto-updates this label every second on its own — no need
        // for the JS layer to push a new state every tick.
        if date > Date() {
            Text(timerInterval: Date()...date, countsDown: true)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(accent)
                .monospacedDigit()
        } else {
            Text("0:00")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(Color.fgMuted)
                .monospacedDigit()
        }
    }
}

// ── Lock-screen / banner view ─────────────────────────────────────────────────
struct OrderExpandedView: View {
    let context: ActivityViewContext<OrderActivityAttributes>

    var body: some View {
        let state = context.state
        let stepDefs = steps(for: state.orderType)
        let stepIdx = clampStep(state.progressStep, count: stepDefs.count)
        let active = stepDefs[stepIdx]

        VStack(alignment: .leading, spacing: 14) {
            // Header
            HStack {
                Image(systemName: "fork.knife")
                    .foregroundStyle(active.color)
                Text("FoodGo")
                    .font(.system(size: 16, weight: .black))
                    .italic()
                    .foregroundStyle(active.color)
                Spacer()
                Text(context.attributes.orderTotal)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.fgMuted)
            }

            // Restaurant + status text
            VStack(alignment: .leading, spacing: 3) {
                Text(context.attributes.restaurantName)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Color.fgText)
                HStack(spacing: 6) {
                    Image(systemName: active.icon)
                        .font(.system(size: 11))
                        .foregroundStyle(active.color)
                    Text(state.statusText)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.fgMuted)
                        .lineLimit(1)
                    Spacer()
                    if active.showsTimer, let endsAt = state.etaEndsAt {
                        CountdownText(endsAt: endsAt, accent: active.color)
                    }
                }
            }

            // Progress row
            StepRow(stepDefs: stepDefs, current: stepIdx)
        }
        .padding(16)
        .background(Color.fgBg)
    }
}

// ── Progress steps row ────────────────────────────────────────────────────────
private struct StepRow: View {
    let stepDefs: [StepDef]
    let current: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<stepDefs.count, id: \.self) { i in
                let def = stepDefs[i]
                let isDone = i < current
                let isActive = i == current
                let circleFill: Color = isDone || isActive ? def.color : Color.fgPanel
                let iconColor: Color = isDone || isActive ? Color.fgBg : Color.fgMuted

                VStack(spacing: 4) {
                    ZStack {
                        Circle()
                            .fill(circleFill)
                            .frame(width: 28, height: 28)
                            .overlay(
                                Circle()
                                    .strokeBorder(isActive ? def.color.opacity(0.6) : Color.clear, lineWidth: 2)
                                    .scaleEffect(isActive ? 1.15 : 1.0)
                            )
                        Image(systemName: def.icon)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(iconColor)
                    }
                    Text(def.label)
                        .font(.system(size: 9, weight: isActive ? .bold : .regular))
                        .foregroundStyle(isActive ? def.color : Color.fgMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                .frame(maxWidth: .infinity)

                if i < stepDefs.count - 1 {
                    Rectangle()
                        .fill(i < current ? stepDefs[i].color : Color.fgPanel)
                        .frame(height: 2)
                        .padding(.bottom, 18)
                }
            }
        }
    }
}

// ── Widget configuration ──────────────────────────────────────────────────────
struct OrderWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OrderActivityAttributes.self) { context in
            OrderExpandedView(context: context)
                .activityBackgroundTint(Color.fgBg)
                .activitySystemActionForegroundColor(Color.fgGold)

        } dynamicIsland: { context in
            let stepDefs = steps(for: context.state.orderType)
            let stepIdx = clampStep(context.state.progressStep, count: stepDefs.count)
            let active = stepDefs[stepIdx]

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "fork.knife")
                            .foregroundStyle(active.color)
                        Text("FoodGo")
                            .font(.system(size: 14, weight: .black))
                            .italic()
                            .foregroundStyle(active.color)
                    }
                    .padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if active.showsTimer, let endsAt = context.state.etaEndsAt {
                        CountdownText(endsAt: endsAt, accent: active.color)
                            .padding(.trailing, 8)
                    } else if let eta = context.state.etaMinutes, stepIdx < stepDefs.count - 1 {
                        Text("~\(eta) min")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(active.color)
                            .padding(.trailing, 8)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    OrderExpandedView(context: context)
                }
            } compactLeading: {
                Image(systemName: active.icon)
                    .foregroundStyle(active.color)
                    .font(.system(size: 14, weight: .semibold))
            } compactTrailing: {
                if active.showsTimer, let endsAt = context.state.etaEndsAt, Date(timeIntervalSince1970: endsAt) > Date() {
                    Text(timerInterval: Date()...Date(timeIntervalSince1970: endsAt), countsDown: true)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(active.color)
                        .monospacedDigit()
                        .frame(width: 50)
                } else {
                    Text(active.label)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(active.color)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            } minimal: {
                Image(systemName: active.icon)
                    .foregroundStyle(active.color)
            }
            .widgetURL(URL(string: "foodgo://order/\(context.attributes.orderId)"))
            .keylineTint(active.color)
        }
    }
}
