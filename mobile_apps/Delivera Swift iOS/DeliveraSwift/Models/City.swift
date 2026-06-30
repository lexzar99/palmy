import Foundation

struct City: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let slug: String
    let isActive: Bool
    let deliveryMode: String?
}
