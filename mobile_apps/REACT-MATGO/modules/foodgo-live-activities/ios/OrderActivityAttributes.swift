// Mirror of ios/OrderWidget/OrderActivityAttributes.swift so the local Expo
// module pod target can compile without depending on the widget extension's
// source. The widget extension keeps its own copy because it is a separate
// build target. Keep both copies BYTE-IDENTICAL — ActivityKit refuses to
// decode the content state if the structures drift.
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
