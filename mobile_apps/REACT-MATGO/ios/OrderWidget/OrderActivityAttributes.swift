// Shared between the main app (via the foodgo-live-activities module) and
// this widget extension target. Both targets must include this file and the
// two copies must stay byte-identical, otherwise ActivityKit can't decode the
// content state and the Dynamic Island renders empty.
import ActivityKit
import Foundation

public struct OrderActivityAttributes: ActivityAttributes {
    public typealias ContentState = OrderState

    public struct OrderState: Codable, Hashable {
        public var status: String        // "accepted" | "preparing" | "ready_delivery" | "ready_pickup" | "on_the_way" | "arrived" | "delivered" | "cancelled"
        public var statusText: String
        public var progressStep: Int     // DELIVERY: 0-3 (4 steps); PICKUP: 0-2 (3 steps)
        public var etaMinutes: Int?
        public var driverName: String?
        public var orderType: String?    // "DELIVERY" | "PICKUP" — drives 4-step vs 3-step UI
        public var etaEndsAt: Double?    // Unix epoch *seconds* when the active step's countdown should hit 0

        public init(
            status: String,
            statusText: String,
            progressStep: Int,
            etaMinutes: Int? = nil,
            driverName: String? = nil,
            orderType: String? = nil,
            etaEndsAt: Double? = nil
        ) {
            self.status = status
            self.statusText = statusText
            self.progressStep = progressStep
            self.etaMinutes = etaMinutes
            self.driverName = driverName
            self.orderType = orderType
            self.etaEndsAt = etaEndsAt
        }
    }

    public var orderId: String
    public var restaurantName: String
    public var orderTotal: String

    public init(orderId: String, restaurantName: String, orderTotal: String) {
        self.orderId = orderId
        self.restaurantName = restaurantName
        self.orderTotal = orderTotal
    }
}
