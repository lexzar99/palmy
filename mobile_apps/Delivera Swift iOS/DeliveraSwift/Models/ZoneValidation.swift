import Foundation

struct ZoneValidationRequest: Encodable {
    let lat: Double
    let lng: Double
}

struct ZoneValidationResponse: Codable, Hashable {
    let covered: Bool
    let cities: [ZoneCity]
}

struct ZoneCity: Codable, Hashable {
    let id: String?
    let name: String?
    let restaurants: [ZoneRestaurant]
}

struct ZoneRestaurant: Codable, Hashable {
    let id: String
    let name: String
    let slug: String
    let isOpen: Bool?
    let deliveryFee: Double?
    let minOrderAmount: Double?
    let etaMinutes: Int?
    let matchedZone: MatchedZone?
}

struct MatchedZone: Codable, Hashable {
    let deliveryFee: Double?
    let minOrder: Double?
    let etaMinutes: Int?

    var feeKr: Double? {
        guard let deliveryFee else { return nil }
        return deliveryFee / 100
    }

    var minOrderKr: Double? {
        guard let minOrder else { return nil }
        return minOrder / 100
    }
}
