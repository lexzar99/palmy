import Foundation

struct PlacePrediction: Identifiable, Decodable, Hashable {
    let description: String
    let placeID: String

    var id: String { placeID }

    enum CodingKeys: String, CodingKey {
        case description
        case placeID = "place_id"
    }
}

struct PlacesAutocompleteResponse: Decodable {
    let predictions: [PlacePrediction]
}

struct PlaceGeocodeResponse: Decodable {
    let location: Coordinate
    let postalCode: String?
    let city: String?
}

struct ReverseGeocodeResponse: Decodable {
    let address: String
    let postalCode: String?
    let city: String?
}

struct Coordinate: Decodable, Hashable {
    let lat: Double
    let lng: Double
}
