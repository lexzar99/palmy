import ExpoModulesCore
import Foundation

// ── OrderDeliveryAttributes (duplicated from MatgoWidgets target) ─────────────
// ActivityKit requires the SAME struct in both the main app and the widget extension.
// Keep this in sync with ios/MatgoWidgets/OrderDeliveryAttributes.swift
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.2, *)
struct OrderDeliveryAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var status: String
        var statusText: String
        var etaMinutes: Int?
        var driverName: String?
        var progressStep: Int
    }
    var orderId: String
    var restaurantName: String
    var orderTotal: String
}
#endif

// ── Expo Native Module ────────────────────────────────────────────────────────
public class LiveActivitiesModule: Module {

    // In-memory map of orderId → Activity ID string
    private var activeActivities: [String: String] = [:]

    public func definition() -> ModuleDefinition {
        Name("LiveActivities")

        // ── Check support ────────────────────────────────────────────────────
        Function("isSupported") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }
            return false
        }

        // ── Start activity ───────────────────────────────────────────────────
        AsyncFunction("startOrderActivity") { (params: [String: Any], promise: Promise) in
            guard #available(iOS 16.2, *) else {
                promise.reject("UNSUPPORTED", "Live Activities require iOS 16.2+")
                return
            }
            #if canImport(ActivityKit)
            let orderId        = params["orderId"]        as? String ?? ""
            let restaurantName = params["restaurantName"] as? String ?? ""
            let orderTotal     = params["orderTotal"]     as? String ?? ""
            let status         = params["status"]         as? String ?? "accepted"
            let statusText     = params["statusText"]     as? String ?? "Order mottagen"
            let etaMinutes     = params["etaMinutes"]     as? Int
            let progressStep   = params["progressStep"]   as? Int ?? 0

            let attributes = OrderDeliveryAttributes(
                orderId:        orderId,
                restaurantName: restaurantName,
                orderTotal:     orderTotal
            )
            let state = OrderDeliveryAttributes.ContentState(
                status:       status,
                statusText:   statusText,
                etaMinutes:   etaMinutes,
                driverName:   nil,
                progressStep: progressStep
            )

            do {
                let activity = try Activity.request(
                    attributes: attributes,
                    content:    .init(state: state, staleDate: nil),
                    pushType:   nil
                )
                self.activeActivities[orderId] = activity.id
                promise.resolve(activity.id)
            } catch {
                promise.reject("START_FAILED", error.localizedDescription)
            }
            #else
            promise.reject("UNSUPPORTED", "ActivityKit not available")
            #endif
        }

        // ── Update activity ──────────────────────────────────────────────────
        AsyncFunction("updateOrderActivity") { (orderId: String, params: [String: Any], promise: Promise) in
            guard #available(iOS 16.2, *) else { promise.resolve(nil); return }
            #if canImport(ActivityKit)
            let status       = params["status"]       as? String ?? "preparing"
            let statusText   = params["statusText"]   as? String ?? ""
            let etaMinutes   = params["etaMinutes"]   as? Int
            let driverName   = params["driverName"]   as? String
            let progressStep = params["progressStep"] as? Int ?? 1

            let newState = OrderDeliveryAttributes.ContentState(
                status:       status,
                statusText:   statusText,
                etaMinutes:   etaMinutes,
                driverName:   driverName,
                progressStep: progressStep
            )

            Task {
                for activity in Activity<OrderDeliveryAttributes>.activities {
                    if activity.attributes.orderId == orderId {
                        await activity.update(.init(state: newState, staleDate: nil))
                    }
                }
                promise.resolve(nil)
            }
            #else
            promise.resolve(nil)
            #endif
        }

        // ── End activity ─────────────────────────────────────────────────────
        AsyncFunction("endOrderActivity") { (orderId: String, promise: Promise) in
            guard #available(iOS 16.2, *) else { promise.resolve(nil); return }
            #if canImport(ActivityKit)
            Task {
                for activity in Activity<OrderDeliveryAttributes>.activities {
                    if activity.attributes.orderId == orderId {
                        await activity.end(.none, dismissalPolicy: .immediate)
                    }
                }
                self.activeActivities.removeValue(forKey: orderId)
                promise.resolve(nil)
            }
            #else
            promise.resolve(nil)
            #endif
        }

        // ── End all activities ───────────────────────────────────────────────
        AsyncFunction("endAllActivities") { (promise: Promise) in
            guard #available(iOS 16.2, *) else { promise.resolve(nil); return }
            #if canImport(ActivityKit)
            Task {
                for activity in Activity<OrderDeliveryAttributes>.activities {
                    await activity.end(.none, dismissalPolicy: .immediate)
                }
                self.activeActivities.removeAll()
                promise.resolve(nil)
            }
            #else
            promise.resolve(nil)
            #endif
        }
    }
}
