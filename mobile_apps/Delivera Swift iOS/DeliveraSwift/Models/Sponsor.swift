import Foundation

struct Sponsor: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let imageUrl: String
    let isActive: Bool?
    let isClickable: Bool?
    let linkType: String?
    let showName: Bool?
    let imageOnly: Bool?
    let tier: String?
    let tagline: String?
    let color: String?
}

struct TrackingAd: Identifiable, Decodable, Hashable {
    let id: String
    let brand: String?
    let title: String
    let subtitle: String?
    let imageUrl: String?
    let url: String?
    let imageOnly: Bool?
    let isActive: Bool?
    let sortOrder: Int?
}

struct PlatformSettings: Decodable, Hashable {
    let companyName: String?
    let organizationNumber: String?
    let companyAddress: String?
    let dpoints: PlatformDpointsSettings?
}

struct PlatformDpointsSettings: Decodable, Hashable {
    let enabled: Bool?
    let perKr: Double?
    let valuePerKr: Double?
}
