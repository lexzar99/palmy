import ActivityKit
import Foundation

// Shared ActivityAttributes struct.
// Must be identical in BOTH the main app target and the MatgoWidgets extension.

public struct OrderDeliveryAttributes: ActivityAttributes {
    public typealias Status = ContentState

    // Dynamic (updated live)
    public struct ContentState: Codable, Hashable {
        /// "accepted" | "preparing" | "on_the_way" | "arrived" | "delivered" | "cancelled"
        public var status: String
        public var statusText: String
        public var etaMinutes: Int?
        public var driverName: String?
        public var progressStep: Int  // 0-4 for the progress bar
    }

    // Static (set once when activity starts)
    public var orderId: String
    public var restaurantName: String
    public var orderTotal: String  // e.g. "289 kr"
}
