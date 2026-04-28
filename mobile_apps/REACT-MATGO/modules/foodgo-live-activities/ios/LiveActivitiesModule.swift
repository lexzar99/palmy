import ActivityKit
import ExpoModulesCore
import Foundation

// Bridge between liveActivities.ts (JS) and ActivityKit (iOS 16.2+).
// This is the canonical module — autolinked through expo-module.config.json
// in modules/foodgo-live-activities/. The legacy copies under ios/ are kept
// only because the OrderWidget extension target imports OrderActivityAttributes.
public class LiveActivitiesModule: Module {
    private var activities: [String: Any] = [:]
    // Tracks per-order pushToken Tasks so we don't double-subscribe.
    private var tokenTasks: [String: Any] = [:]

    public func definition() -> ModuleDefinition {
        Name("LiveActivities")

        // JS subscribes to "onPushTokenUpdate" to receive the per-activity APNs
        // push token (hex string) so it can forward it to the backend, which
        // then uses it to push status updates into the Dynamic Island even
        // when the app is in the background or killed.
        Events("onPushTokenUpdate")

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

            // Prevent duplicates for the same order
            let orderId = params["orderId"] as? String ?? UUID().uuidString
            for existing in Activity<OrderActivityAttributes>.activities
            where existing.attributes.orderId == orderId {
                self.activities[orderId] = existing
                self.observePushToken(for: existing, orderId: orderId)
                return existing.id
            }

            let restaurantName = params["restaurantName"] as? String ?? ""
            let orderTotal     = params["orderTotal"] as? String ?? ""
            let status         = params["status"] as? String ?? "accepted"
            let statusText     = params["statusText"] as? String ?? ""
            let progressStep   = params["progressStep"] as? Int ?? 0
            let etaMinutes     = params["etaMinutes"] as? Int
            let driverName     = params["driverName"] as? String
            let orderType      = params["orderType"] as? String
            let etaEndsAt      = params["etaEndsAt"] as? Double

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
                driverName: driverName,
                orderType: orderType,
                etaEndsAt: etaEndsAt
            )

            // High relevanceScore on creation makes iOS show the activity expanded briefly.
            // pushType: .token enables push-to-update — APNs can now deliver state
            // updates directly into the Dynamic Island without the app running.
            let content = ActivityContent(state: state, staleDate: nil, relevanceScore: 100)
            let activity = try Activity<OrderActivityAttributes>.request(
                attributes: attrs,
                content: content,
                pushType: .token
            )
            self.activities[orderId] = activity
            self.observePushToken(for: activity, orderId: orderId)
            return activity.id
        }

        AsyncFunction("updateOrderActivity") { (orderId: String, params: [String: Any]) in
            guard #available(iOS 16.2, *) else { return }

            let status       = params["status"] as? String ?? ""
            let statusText   = params["statusText"] as? String ?? ""
            let progressStep = params["progressStep"] as? Int ?? 0
            let etaMinutes   = params["etaMinutes"] as? Int
            let driverName   = params["driverName"] as? String
            let orderType    = params["orderType"] as? String
            let etaEndsAt    = params["etaEndsAt"] as? Double

            let newState = OrderActivityAttributes.OrderState(
                status: status,
                statusText: statusText,
                progressStep: progressStep,
                etaMinutes: etaMinutes,
                driverName: driverName,
                orderType: orderType,
                etaEndsAt: etaEndsAt
            )
            // High relevanceScore on each update so iOS shows the activity prominently when status changes
            let content = ActivityContent(state: newState, staleDate: nil, relevanceScore: 100)
            let alert = AlertConfiguration(
                title: LocalizedStringResource("FoodGo"),
                body: LocalizedStringResource(stringLiteral: statusText),
                sound: .default
            )

            if let activity = self.activities[orderId] as? Activity<OrderActivityAttributes> {
                await activity.update(content, alertConfiguration: alert)
            } else {
                for activity in Activity<OrderActivityAttributes>.activities
                where activity.attributes.orderId == orderId {
                    await activity.update(content, alertConfiguration: alert)
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
            if let task = self.tokenTasks[orderId] as? Task<Void, Never> {
                task.cancel()
                self.tokenTasks.removeValue(forKey: orderId)
            }
        }

        AsyncFunction("endAllActivities") { () in
            guard #available(iOS 16.2, *) else { return }
            for activity in Activity<OrderActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            self.activities.removeAll()
            self.tokenTasks.removeAll()
        }

        // Re-attach token observers for any activities that survived an app
        // restart so the backend always has a fresh token.
        OnCreate {
            if #available(iOS 16.2, *) {
                for activity in Activity<OrderActivityAttributes>.activities {
                    self.activities[activity.attributes.orderId] = activity
                    self.observePushToken(for: activity, orderId: activity.attributes.orderId)
                }
            }
        }
    }

    @available(iOS 16.2, *)
    private func observePushToken(for activity: Activity<OrderActivityAttributes>, orderId: String) {
        guard tokenTasks[orderId] == nil else { return }
        let task = Task { [weak self] in
            // Emit the initial token if it's already available.
            if let initialData = activity.pushToken {
                let hex = initialData.map { String(format: "%02x", $0) }.joined()
                self?.sendEvent("onPushTokenUpdate", [
                    "orderId": orderId,
                    "token": hex
                ])
            }
            for await tokenData in activity.pushTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                self?.sendEvent("onPushTokenUpdate", [
                    "orderId": orderId,
                    "token": hex
                ])
            }
        }
        tokenTasks[orderId] = task
    }
}
