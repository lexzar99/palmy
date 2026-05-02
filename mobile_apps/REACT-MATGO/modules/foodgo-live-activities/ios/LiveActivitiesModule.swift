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
    // Per-order native auto-end Tasks. Scheduled when an activity enters
    // "on_the_way" with an etaEndsAt — at that absolute time + a tiny
    // grace, native code calls activity.end() locally. This is the
    // belt-and-braces dismiss path that doesn't depend on APNs delivery
    // (which iOS aggressively throttles) or on JS being awake (which iOS
    // suspends after ~30 s of backgrounding). Cancelled and rescheduled
    // on every update; cancelled when endOrderActivity is called.
    private var endTasks: [String: Task<Void, Never>] = [:]
    // Guards against two near-simultaneous startOrderActivity calls (e.g. a
    // user double-tapping "Place order", or an offline retry racing the
    // original POST) racing past the duplicate check before either has a
    // chance to register itself in `activities`. Without this you can end up
    // with two Live Activities for the same order until iOS garbage-collects
    // the loser.
    private var inFlightStarts: Set<String> = []

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

            let orderId = params["orderId"] as? String ?? UUID().uuidString

            // Race guard: if another start for this orderId is mid-flight,
            // drop in and return the activity it ends up creating instead of
            // racing it.
            if self.inFlightStarts.contains(orderId) {
                if let existing = self.activities[orderId] as? Activity<OrderActivityAttributes> {
                    return existing.id
                }
                // Wait one runloop tick and re-check — the other call should
                // have populated `activities` by then.
                try? await Task.sleep(nanoseconds: 100_000_000)
                if let existing = self.activities[orderId] as? Activity<OrderActivityAttributes> {
                    return existing.id
                }
            }
            self.inFlightStarts.insert(orderId)
            defer { self.inFlightStarts.remove(orderId) }

            // Prevent duplicates for the same order (covers activities that
            // survived a process restart).
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
            //
            // Initial staleDate matters for the "app is killed and every push is
            // throttled" worst case. Without it the LA stays "fresh" forever in
            // the widget process and iOS never fades it. Pin it to the initial
            // ETA when known, or 90 min as a generous upper bound (kitchen +
            // delivery). When real updates arrive we re-pin staleDate in
            // updateOrderActivity.
            let initialStaleDate: Date
            if let endsAt = etaEndsAt {
                initialStaleDate = Date(timeIntervalSince1970: endsAt + 60)
            } else {
                initialStaleDate = Date().addingTimeInterval(90 * 60)
            }
            let content = ActivityContent(state: state, staleDate: initialStaleDate, relevanceScore: 100)
            let activity = try Activity<OrderActivityAttributes>.request(
                attributes: attrs,
                content: content,
                pushType: .token
            )
            self.activities[orderId] = activity
            self.observePushToken(for: activity, orderId: orderId)

            // Schedule the same native auto-end if we're already on_the_way at
            // creation time (rare — usually transitions to on_the_way later).
            if status == "on_the_way", let endsAt = etaEndsAt {
                self.scheduleAutoEnd(orderId: orderId, atEpochSeconds: endsAt + 5)
            }
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
            // Silent state update — DO NOT pass an AlertConfiguration here.
            // Every alertConfiguration triggers a system "ding" sound, which
            // made the app appear to receive a new notification each time the
            // user navigated and the global LA sync re-fetched the order.
            //
            // staleDate sets the visual "stale" cutoff. For on_the_way we
            // pin it to the countdown end + grace, so iOS will fade the
            // banner the moment the order is supposed to be delivered even
            // if every dismiss push was throttled. Other phases use the
            // generous 90 min upper-bound so a forgotten activity grays out
            // instead of lingering for hours.
            let staleDate: Date
            if status == "on_the_way", let endsAt = etaEndsAt {
                staleDate = Date(timeIntervalSince1970: endsAt + 60)
            } else {
                staleDate = Date().addingTimeInterval(90 * 60)
            }
            let content = ActivityContent(state: newState, staleDate: staleDate, relevanceScore: 100)

            if let activity = self.activities[orderId] as? Activity<OrderActivityAttributes> {
                await activity.update(content)
            } else {
                for activity in Activity<OrderActivityAttributes>.activities
                where activity.attributes.orderId == orderId {
                    await activity.update(content)
                    self.activities[orderId] = activity
                    break
                }
            }

            // Schedule a native auto-end at etaEndsAt + 5 s grace. This is
            // the dismiss path that survives push throttling AND a dead JS
            // context — it lives inside the host app process and runs
            // whenever iOS gives the process any execution time. If the
            // process is fully terminated the staleDate fallback above
            // still fades the banner.
            if status == "on_the_way", let endsAt = etaEndsAt {
                self.scheduleAutoEnd(orderId: orderId, atEpochSeconds: endsAt + 5)
            } else {
                self.cancelScheduledEnd(orderId: orderId)
            }
        }

        // Single-arg form on purpose: this is the version that has shipped
        // and is known to dismiss the LA reliably for CANCEL. We tried
        // adding an options dict (dismissalSeconds / final state) earlier
        // and it broke the dismiss path — keep it simple. iOS removes the
        // activity ~8 seconds after this call regardless of the prior state.
        AsyncFunction("endOrderActivity") { (orderId: String) in
            guard #available(iOS 16.2, *) else { return }

            self.cancelScheduledEnd(orderId: orderId)

            // Push a final high-relevance ActivityContent so the Dynamic
            // Island stays visible for the same ~8 seconds as the Lock
            // Screen banner — without this iOS often drops the Island the
            // moment we call .end() because relevanceScore implicitly falls
            // back to 0 at termination.
            func finalContent(for activity: Activity<OrderActivityAttributes>) -> ActivityContent<OrderActivityAttributes.OrderState> {
                let staleDate = Date().addingTimeInterval(15)
                return ActivityContent(state: activity.content.state, staleDate: staleDate, relevanceScore: 100)
            }

            if let activity = self.activities[orderId] as? Activity<OrderActivityAttributes> {
                await activity.end(finalContent(for: activity), dismissalPolicy: .after(.now + 8))
                self.activities.removeValue(forKey: orderId)
            } else {
                for activity in Activity<OrderActivityAttributes>.activities
                where activity.attributes.orderId == orderId {
                    await activity.end(finalContent(for: activity), dismissalPolicy: .after(.now + 8))
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
            // Cancel before clearing — `removeAll()` alone leaves the
            // pushTokenUpdates async streams alive, which keeps the Tasks
            // running and slowly leaks if `endAllActivities` is called again.
            for case let task as Task<Void, Never> in self.tokenTasks.values {
                task.cancel()
            }
            for task in self.endTasks.values {
                task.cancel()
            }
            self.activities.removeAll()
            self.tokenTasks.removeAll()
            self.endTasks.removeAll()
            self.inFlightStarts.removeAll()
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

    private func cancelScheduledEnd(orderId: String) {
        endTasks[orderId]?.cancel()
        endTasks.removeValue(forKey: orderId)
    }

    @available(iOS 16.2, *)
    private func scheduleAutoEnd(orderId: String, atEpochSeconds: Double) {
        cancelScheduledEnd(orderId: orderId)
        let nowEpoch = Date().timeIntervalSince1970
        let delaySeconds = max(0, atEpochSeconds - nowEpoch)
        let task = Task { [weak self] in
            if delaySeconds > 0 {
                try? await Task.sleep(nanoseconds: UInt64(delaySeconds * 1_000_000_000))
            }
            if Task.isCancelled { return }
            await self?.runAutoEnd(orderId: orderId)
        }
        endTasks[orderId] = task
    }

    @available(iOS 16.2, *)
    @MainActor
    private func runAutoEnd(orderId: String) async {
        defer { endTasks.removeValue(forKey: orderId) }
        if let activity = activities[orderId] as? Activity<OrderActivityAttributes> {
            let finalContent = ActivityContent(
                state: activity.content.state,
                staleDate: Date().addingTimeInterval(15),
                relevanceScore: 100
            )
            await activity.end(finalContent, dismissalPolicy: .after(.now + 5))
            activities.removeValue(forKey: orderId)
        } else {
            for activity in Activity<OrderActivityAttributes>.activities
            where activity.attributes.orderId == orderId {
                let finalContent = ActivityContent(
                    state: activity.content.state,
                    staleDate: Date().addingTimeInterval(15),
                    relevanceScore: 100
                )
                await activity.end(finalContent, dismissalPolicy: .after(.now + 5))
                break
            }
        }
        if let task = tokenTasks[orderId] as? Task<Void, Never> {
            task.cancel()
            tokenTasks.removeValue(forKey: orderId)
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
