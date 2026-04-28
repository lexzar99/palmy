import ActivityKit
import ExpoModulesCore
import Foundation

// Bridge between liveActivities.ts (JS) and ActivityKit (iOS 16.2+)
public class LiveActivitiesModule: Module {
    // Keyed by orderId → Activity
    private var activities: [String: Any] = [:]

    public func definition() -> ModuleDefinition {
        Name("LiveActivities")

        Function("isSupported") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }

        AsyncFunction("startOrderActivity") { (params: [String: Any]) -> String in
            guard #available(iOS 16.2, *) else {
                throw NSError(domain: "LiveActivities", code: -1, userInfo: [NSLocalizedDescriptionKey: "Requires iOS 16.2+"])
            }

            let orderId        = params["orderId"] as? String ?? UUID().uuidString
            let restaurantName = params["restaurantName"] as? String ?? ""
            let orderTotal     = params["orderTotal"] as? String ?? ""
            let status         = params["status"] as? String ?? "accepted"
            let statusText     = params["statusText"] as? String ?? ""
            let progressStep   = params["progressStep"] as? Int ?? 0
            let etaMinutes     = params["etaMinutes"] as? Int
            let driverName     = params["driverName"] as? String

            let attrs = OrderActivityAttributes(
                orderId: orderId,
                restaurantName: restaurantName,
                orderTotal: orderTotal
            )
            let state = OrderActivityAttributes.OrderState(
                status: status,
                statusText: statusText,
                progressStep: progressStep,
                etaMinutes: etaMinutes,
                driverName: driverName
            )

            let content = ActivityContent(state: state, staleDate: nil)
            let activity = try Activity<OrderActivityAttributes>.request(
                attributes: attrs,
                content: content,
                pushType: nil
            )
            self.activities[orderId] = activity
            return activity.id
        }

        AsyncFunction("updateOrderActivity") { (orderId: String, params: [String: Any]) in
            guard #available(iOS 16.2, *) else { return }

            let status       = params["status"] as? String ?? ""
            let statusText   = params["statusText"] as? String ?? ""
            let progressStep = params["progressStep"] as? Int ?? 0
            let etaMinutes   = params["etaMinutes"] as? Int
            let driverName   = params["driverName"] as? String

            let newState = OrderActivityAttributes.OrderState(
                status: status,
                statusText: statusText,
                progressStep: progressStep,
                etaMinutes: etaMinutes,
                driverName: driverName
            )
            let content = ActivityContent(state: newState, staleDate: nil)

            if let activity = self.activities[orderId] as? Activity<OrderActivityAttributes> {
                await activity.update(content)
            } else {
                // Re-attach to any running activity for this orderId
                for activity in Activity<OrderActivityAttributes>.activities
                where activity.attributes.orderId == orderId {
                    await activity.update(content)
                    self.activities[orderId] = activity
                    break
                }
            }
        }

        AsyncFunction("endOrderActivity") { (orderId: String) in
            guard #available(iOS 16.2, *) else { return }

            if let activity = self.activities[orderId] as? Activity<OrderActivityAttributes> {
                await activity.end(nil, dismissalPolicy: .after(.now + 8))
                self.activities.removeValue(forKey: orderId)
            } else {
                for activity in Activity<OrderActivityAttributes>.activities
                where activity.attributes.orderId == orderId {
                    await activity.end(nil, dismissalPolicy: .after(.now + 8))
                    break
                }
            }
        }

        AsyncFunction("endAllActivities") { () in
            guard #available(iOS 16.2, *) else { return }
            for activity in Activity<OrderActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            self.activities.removeAll()
        }
    }
}
