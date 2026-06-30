import Foundation

struct HomeCategorySection: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let slug: String
    let subtitle: String?
    let isActive: Bool
    let sortOrder: Int
    let filterMode: String
    let maxRestaurants: Int
    let manualRestaurantIds: [String]
    let filters: HomeCategoryFilters
}

struct HomeCategoryFilters: Decodable, Hashable {
    let searchTerm: String?
    let cuisines: [String]
    let tags: [String]
    let featuredClasses: [Int]
    let maxEtaMinutes: Int?
    let freeDeliveryOnly: Bool
    let openNowOnly: Bool

    enum CodingKeys: String, CodingKey {
        case searchTerm
        case cuisines
        case tags
        case featuredClasses
        case maxEtaMinutes
        case freeDeliveryOnly
        case openNowOnly
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        searchTerm = try container.decodeIfPresent(String.self, forKey: .searchTerm)
        cuisines = try container.decodeIfPresent([String].self, forKey: .cuisines) ?? []
        tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        featuredClasses = try container.decodeIfPresent([Int].self, forKey: .featuredClasses) ?? []
        maxEtaMinutes = try container.decodeIfPresent(Int.self, forKey: .maxEtaMinutes)
        freeDeliveryOnly = try container.decodeIfPresent(Bool.self, forKey: .freeDeliveryOnly) ?? false
        openNowOnly = try container.decodeIfPresent(Bool.self, forKey: .openNowOnly) ?? false
    }
}
