import ActivityKit
import Foundation

struct OrderActivityAttributes: ActivityAttributes {
    typealias ContentState = OrderState

    struct OrderState: Codable, Hashable {
        var status: String
        var statusText: String
        var progressStep: Int
        var etaMinutes: Int?
        var driverName: String?
        var orderType: String?
        var etaEndsAt: Double?
    }

    var orderId: String
    var restaurantName: String
    var orderTotal: String
}
