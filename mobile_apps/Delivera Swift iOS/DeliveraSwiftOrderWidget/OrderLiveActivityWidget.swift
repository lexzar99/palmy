import ActivityKit
import SwiftUI
import WidgetKit

private extension Color {
    static let deliveraOrange = Color(red: 0.96, green: 0.27, blue: 0.08)
    static let deliveraInk = Color(red: 0.05, green: 0.05, blue: 0.06)
    static let deliveraMuted = Color(red: 0.44, green: 0.44, blue: 0.46)
    static let deliveraSoft = Color(red: 1.0, green: 0.96, blue: 0.91)
    static let deliveraGreen = Color(red: 0.11, green: 0.70, blue: 0.36)
    static let deliveraGold = Color(red: 0.96, green: 0.67, blue: 0.10)
}

private struct LiveStep {
    let title: String
    let icon: String
    let color: Color
    let showsTimer: Bool
}

private func liveSteps(for orderType: String?) -> [LiveStep] {
    if orderType == "PICKUP" {
        return [
            LiveStep(title: "Mottagen", icon: "checkmark.circle.fill", color: .deliveraGold, showsTimer: false),
            LiveStep(title: "Tillagas", icon: "flame.fill", color: .deliveraOrange, showsTimer: true),
            LiveStep(title: "Hämta", icon: "bag.fill", color: .deliveraGreen, showsTimer: false)
        ]
    }

    return [
        LiveStep(title: "Mottagen", icon: "checkmark.circle.fill", color: .deliveraGold, showsTimer: false),
        LiveStep(title: "Tillagas", icon: "flame.fill", color: .deliveraOrange, showsTimer: true),
        LiveStep(title: "På väg", icon: "car.fill", color: .deliveraGreen, showsTimer: true)
    ]
}

private func clampedStep(_ step: Int, count: Int) -> Int {
    max(0, min(step, count - 1))
}

private struct BrandMark: View {
    var compact = false

    var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            RoundedRectangle(cornerRadius: compact ? 5 : 7, style: .continuous)
                .fill(Color.deliveraOrange)
                .frame(width: compact ? 18 : 24, height: compact ? 18 : 24)
                .overlay(
                    RoundedRectangle(cornerRadius: compact ? 3 : 4, style: .continuous)
                        .stroke(.white, lineWidth: compact ? 2 : 2.5)
                        .rotationEffect(.degrees(45))
                        .padding(compact ? 5 : 7)
                )
            if !compact {
                Text("Delivera")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(Color.deliveraInk)
            }
        }
    }
}

private struct CountdownBadge: View {
    let endsAt: Double?
    let etaMinutes: Int?
    let color: Color

    var body: some View {
        if let endsAt, Date(timeIntervalSince1970: endsAt) > Date() {
            Text(timerInterval: Date()...Date(timeIntervalSince1970: endsAt), countsDown: true)
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(color)
        } else if let etaMinutes {
            Text("~\(etaMinutes) min")
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .foregroundStyle(color)
        }
    }
}

private struct OrderLiveExpandedView: View {
    let context: ActivityViewContext<OrderActivityAttributes>
    var showHeader = true

    var body: some View {
        let steps = liveSteps(for: context.state.orderType)
        let stepIndex = clampedStep(context.state.progressStep, count: steps.count)
        let active = steps[stepIndex]

        VStack(alignment: .leading, spacing: showHeader ? 12 : 9) {
            if showHeader {
                HStack(spacing: 10) {
                    BrandMark()
                    Spacer()
                    Text(context.attributes.orderTotal)
                        .font(.system(size: 14, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color.deliveraOrange)
                }
            }

            HStack(alignment: .center, spacing: 10) {
                ZStack {
                    Circle()
                        .fill(active.color.opacity(0.16))
                        .frame(width: 38, height: 38)
                    Image(systemName: active.icon)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(active.color)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.restaurantName)
                        .font(.system(size: showHeader ? 17 : 15, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color.deliveraInk)
                        .lineLimit(1)
                    Text(context.state.statusText)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.deliveraMuted)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)
                CountdownBadge(endsAt: context.state.etaEndsAt, etaMinutes: context.state.etaMinutes, color: active.color)
            }

            ProgressTrack(steps: steps, current: stepIndex)
        }
        .padding(showHeader ? 16 : 12)
        .background(
            LinearGradient(
                colors: [.white, Color.deliveraSoft],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }
}

private struct ProgressTrack: View {
    let steps: [LiveStep]
    let current: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(steps.indices, id: \.self) { index in
                let step = steps[index]
                let isDone = index <= current

                VStack(spacing: 4) {
                    Circle()
                        .fill(isDone ? step.color : Color.black.opacity(0.08))
                        .frame(width: 18, height: 18)
                        .overlay(
                            Image(systemName: index < current ? "checkmark" : step.icon)
                                .font(.system(size: 8, weight: .heavy))
                                .foregroundStyle(isDone ? .white : Color.deliveraMuted)
                        )
                    Text(step.title)
                        .font(.system(size: 9, weight: index == current ? .heavy : .bold, design: .rounded))
                        .foregroundStyle(index == current ? step.color : Color.deliveraMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .frame(maxWidth: .infinity)

                if index < steps.count - 1 {
                    Capsule()
                        .fill(index < current ? steps[index + 1].color : Color.black.opacity(0.08))
                        .frame(height: 3)
                        .padding(.horizontal, -10)
                        .padding(.bottom, 18)
                }
            }
        }
    }
}

struct DeliveraOrderLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OrderActivityAttributes.self) { context in
            OrderLiveExpandedView(context: context)
                .activityBackgroundTint(.white)
                .activitySystemActionForegroundColor(.deliveraOrange)
        } dynamicIsland: { context in
            let steps = liveSteps(for: context.state.orderType)
            let stepIndex = clampedStep(context.state.progressStep, count: steps.count)
            let active = steps[stepIndex]

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        BrandMark(compact: true)
                        Text("Delivera")
                            .font(.system(size: 14, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CountdownBadge(endsAt: context.state.etaEndsAt, etaMinutes: context.state.etaMinutes, color: active.color)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    OrderLiveExpandedView(context: context, showHeader: false)
                }
            } compactLeading: {
                BrandMark(compact: true)
            } compactTrailing: {
                if active.showsTimer, let endsAt = context.state.etaEndsAt, Date(timeIntervalSince1970: endsAt) > Date() {
                    Text(timerInterval: Date()...Date(timeIntervalSince1970: endsAt), countsDown: true)
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(active.color)
                        .frame(width: 45)
                } else {
                    Image(systemName: active.icon)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(active.color)
                }
            } minimal: {
                BrandMark(compact: true)
            }
            .keylineTint(active.color)
            .widgetURL(URL(string: "delivera://order/\(context.attributes.orderId)"))
        }
    }
}

@main
struct DeliveraSwiftOrderWidgetBundle: WidgetBundle {
    var body: some Widget {
        DeliveraOrderLiveActivityWidget()
    }
}
