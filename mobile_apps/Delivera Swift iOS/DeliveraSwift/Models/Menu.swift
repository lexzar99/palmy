import Foundation

struct MenuResponse: Decodable, Hashable {
    let categories: [MenuCategory]

    init(from decoder: Decoder) throws {
        if let array = try? [MenuCategory](from: decoder) {
            categories = array
            return
        }

        let container = try decoder.container(keyedBy: CodingKeys.self)
        categories = (try? container.decode([MenuCategory].self, forKey: .categories)) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case categories
    }
}

struct MenuCategory: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let slug: String?
    let description: String?
    let imageUrl: String?
    let products: [MenuProduct]
}

struct MenuProduct: Identifiable, Codable, Hashable {
    let id: String
    let slug: String?
    let name: String
    let description: String?
    let price: Double
    let discountActive: Bool?
    let discountPercent: Double?
    let discountPrice: Double?
    let discountLabel: String?
    let imageUrl: String?
    let isVegan: Bool?
    let isVegetarian: Bool?
    let isGlutenFree: Bool?
    let rewardable: Bool?
    let rewardPointsMultiplier: Double?
    let rewardPointsPrice: Int?
    let displayMode: String?
    let hideDescription: Bool?
    let extraGroups: [MenuExtraGroup]?

    var effectivePrice: Double {
        if discountActive == true, let discountPrice {
            return discountPrice
        }
        return price
    }

    var requiresConfiguration: Bool {
        !(extraGroups ?? []).isEmpty
    }

    var hasImage: Bool {
        guard let imageUrl else { return false }
        return !imageUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func dpointsUnitCost(valuePerKr: Double, extrasTotal: Double = 0) -> Int {
        if let rewardPointsPrice, rewardPointsPrice > 0 {
            return rewardPointsPrice
        }
        let factor = (rewardPointsMultiplier ?? valuePerKr) > 0 ? (rewardPointsMultiplier ?? valuePerKr) : valuePerKr
        return Int(ceil(max(0, effectivePrice + extrasTotal) * factor))
    }
}

struct DpointsMe: Decodable, Hashable {
    let enabled: Bool
    let balance: Int
    let valuePerKr: Double
}

struct MenuExtraGroup: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let description: String?
    let type: String?
    let required: Bool?
    let minSelections: Int?
    let maxSelections: Int?
    let displayStyle: String?
    let allowQuantity: Bool?
    let extras: [MenuExtra]
}

struct MenuExtra: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let priceAddon: Double?
    let isDefault: Bool?
    let imageUrl: String?

    var hasImage: Bool {
        guard let imageUrl else { return false }
        return !imageUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
