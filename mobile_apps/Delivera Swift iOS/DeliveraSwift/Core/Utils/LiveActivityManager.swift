import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

final class LiveActivityManager: @unchecked Sendable {
    static let shared = LiveActivityManager()

    #if canImport(ActivityKit)
    private var activities: [String: Activity<OrderActivityAttributes>] = [:]
    private var tokenTasks: [String: Task<Void, Never>] = [:]
    #endif

    private init() {}

    func startOrUpdate(order: ActiveHomeOrder) async {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        if let activity = activities[order.id] ?? Activity<OrderActivityAttributes>.activities.first(where: { $0.attributes.orderId == order.id }) {
            activities[order.id] = activity
            await update(order: order)
            observePushToken(orderId: order.id)
            return
        }

        let attributes = OrderActivityAttributes(
            orderId: order.id,
            restaurantName: order.restaurantName,
            orderTotal: priceText(order.total)
        )
        let content = ActivityContent(state: contentState(for: order), staleDate: nil)

        do {
            let activity = try Activity<OrderActivityAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: .token
            )
            activities[order.id] = activity
            observePushToken(orderId: order.id)
        } catch {
            print("Live Activity push-token start failed, falling back to local activity:", error.localizedDescription)
            do {
                let activity = try Activity<OrderActivityAttributes>.request(
                    attributes: attributes,
                    content: content,
                    pushType: nil
                )
                activities[order.id] = activity
            } catch {
                print("Live Activity local start failed:", error.localizedDescription)
            }
        }
        #endif
    }

    func update(order: ActiveHomeOrder) async {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return }
        let matches = Activity<OrderActivityAttributes>.activities.filter { $0.attributes.orderId == order.id }
        for activity in matches {
            await activity.update(ActivityContent(state: contentState(for: order), staleDate: nil))
        }
        #endif
    }

    func end(orderId: String) async {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return }
        tokenTasks[orderId]?.cancel()
        tokenTasks[orderId] = nil
        let matches = Activity<OrderActivityAttributes>.activities.filter { $0.attributes.orderId == orderId }
        for activity in matches {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        activities[orderId] = nil
        #endif
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private func observePushToken(orderId: String) {
        guard tokenTasks[orderId] == nil else { return }
        tokenTasks[orderId] = Task { [orderId] in
            for await updatedActivity in Activity<OrderActivityAttributes>.activityUpdates where updatedActivity.attributes.orderId == orderId {
                for await tokenData in updatedActivity.pushTokenUpdates {
                    let token = tokenData.map { String(format: "%02x", $0) }.joined()
                    do {
                        try await DeliveraAPI().registerLiveActivityToken(orderId: orderId, token: token)
                    } catch {
                        print("Live Activity token registration failed:", error.localizedDescription)
                    }
                }
            }
        }
    }

    @available(iOS 16.2, *)
    private func contentState(for order: ActiveHomeOrder) -> OrderActivityAttributes.OrderState {
        OrderActivityAttributes.OrderState(
            status: liveActivityStatus(for: order),
            statusText: order.displayStatusTitle,
            progressStep: liveActivityStep(for: order),
            etaMinutes: Int(order.etaText.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()),
            driverName: order.shouldShowCourierLocation ? order.courierName : nil,
            orderType: order.mode == .pickup ? "PICKUP" : "DELIVERY",
            etaEndsAt: nil
        )
    }

    private func liveActivityStatus(for order: ActiveHomeOrder) -> String {
        switch order.status {
        case .pending, .accepted: return "accepted"
        case .preparing: return "preparing"
        case .delivering: return order.mode == .pickup ? "ready_pickup" : "on_the_way"
        case .delivered: return "delivered"
        }
    }

    private func liveActivityStep(for order: ActiveHomeOrder) -> Int {
        switch order.status {
        case .pending, .accepted: return 0
        case .preparing: return 1
        case .delivering, .delivered: return 2
        }
    }
    #endif
}
