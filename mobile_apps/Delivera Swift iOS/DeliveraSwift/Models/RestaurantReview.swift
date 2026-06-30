import Foundation

struct RestaurantReviewsResponse: Decodable, Hashable {
    let averageRating: Double
    let totalCount: Int
    let reviews: [RestaurantReview]
}

struct RestaurantReview: Identifiable, Decodable, Hashable {
    let id: String
    let customerName: String
    let rating: Int?
    let comment: String?
    let reply: String?
    let likedItems: [String]?
    let createdAt: String?
}
