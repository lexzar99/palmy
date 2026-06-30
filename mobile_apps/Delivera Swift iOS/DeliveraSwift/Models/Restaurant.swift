import Foundation

struct Restaurant: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let slug: String
    let cuisine: String?
    let description: String?
    let address: String?
    let city: String?
    let phone: String?
    let latitude: Double?
    let longitude: Double?
    let selfDelivery: Bool?
    let legalName: String?
    let organizationNumber: String?
    let imageUrl: String?
    let heroImageUrl: String?
    let rating: Double?
    let ratingCount: Int?
    let deliveryFee: Double?
    let minOrderAmount: Double?
    let vatPercent: Double?
    let etaMinutes: Int?
    let isOpen: Bool?
    let comingSoon: Bool?
    let pausedUntil: String?
    let featuredClass: Int?
    let tags: [String]?
    let openingHours: RestaurantOpeningHours?
}

struct RestaurantOpeningHours: Decodable, Hashable {
    let days: [String: OpeningDay]
    let specialCount: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicCodingKey.self)
        var parsed: [String: OpeningDay] = [:]
        var specials = 0

        for key in container.allKeys {
            if key.stringValue == "regular",
               let nested = try? container.decode([String: OpeningDay].self, forKey: key) {
                parsed.merge(nested) { _, new in new }
            } else if key.stringValue == "special",
                      var specialContainer = try? container.nestedUnkeyedContainer(forKey: key) {
                while !specialContainer.isAtEnd {
                    _ = try? specialContainer.decode(LooseJSONValue.self)
                    specials += 1
                }
            } else if let day = try? container.decode(OpeningDay.self, forKey: key) {
                parsed[key.stringValue] = day
            }
        }

        days = parsed
        specialCount = specials
    }
}

struct LooseJSONValue: Decodable, Hashable {
    init(from decoder: Decoder) throws {
        if let container = try? decoder.singleValueContainer() {
            if container.decodeNil() { return }
            if (try? container.decode(Bool.self)) != nil { return }
            if (try? container.decode(Double.self)) != nil { return }
            if (try? container.decode(String.self)) != nil { return }
        }
        if var array = try? decoder.unkeyedContainer() {
            while !array.isAtEnd {
                _ = try? array.decode(LooseJSONValue.self)
            }
            return
        }
        if let object = try? decoder.container(keyedBy: DynamicCodingKey.self) {
            for key in object.allKeys {
                _ = try? object.decode(LooseJSONValue.self, forKey: key)
            }
        }
    }
}

struct OpeningDay: Decodable, Hashable {
    let closed: Bool
    let slots: [OpeningSlot]

    init(from decoder: Decoder) throws {
        if var array = try? decoder.unkeyedContainer() {
            var slots: [OpeningSlot] = []
            while !array.isAtEnd {
                if let slot = try? array.decode(OpeningSlot.self) {
                    slots.append(slot)
                }
            }
            self.closed = false
            self.slots = slots
            return
        }

        let container = try decoder.container(keyedBy: DynamicCodingKey.self)
        closed = (try? container.decode(Bool.self, forKey: DynamicCodingKey("closed"))) ?? false

        if let shifts = try? container.decode([OpeningSlot].self, forKey: DynamicCodingKey("shifts")) {
            slots = shifts
        } else if let open = try? container.decode(String.self, forKey: DynamicCodingKey("open")) {
            let close = try? container.decode(String.self, forKey: DynamicCodingKey("close"))
            slots = [OpeningSlot(open: open, close: close)]
        } else {
            slots = []
        }
    }
}

struct OpeningSlot: Decodable, Hashable {
    let open: String
    let close: String?
}

struct DynamicCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init(_ stringValue: String) {
        self.stringValue = stringValue
        self.intValue = nil
    }

    init?(stringValue: String) {
        self.init(stringValue)
    }

    init?(intValue: Int) {
        self.stringValue = String(intValue)
        self.intValue = intValue
    }
}

extension Restaurant {
    var hasImage: Bool {
        let value = heroImageUrl ?? imageUrl ?? ""
        return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func placeholder(slug: String) -> Restaurant {
        Restaurant(
            id: slug,
            name: "Restaurang",
            slug: slug,
            cuisine: nil,
            description: nil,
            address: nil,
            city: nil,
            phone: nil,
            latitude: nil,
            longitude: nil,
            selfDelivery: nil,
            legalName: nil,
            organizationNumber: nil,
            imageUrl: nil,
            heroImageUrl: nil,
            rating: nil,
            ratingCount: nil,
            deliveryFee: nil,
            minOrderAmount: nil,
            vatPercent: nil,
            etaMinutes: nil,
            isOpen: nil,
            comingSoon: nil,
            pausedUntil: nil,
            featuredClass: nil,
            tags: nil,
            openingHours: nil
        )
    }
}
