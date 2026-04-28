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
        public var progressStep: Int     // 0–4
        public var etaMinutes: Int?
        public var driverName: String?
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
