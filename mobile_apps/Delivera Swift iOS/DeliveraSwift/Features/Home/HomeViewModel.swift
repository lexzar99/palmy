import Foundation

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var restaurants: [Restaurant] = []
    @Published private(set) var sponsors: [Sponsor] = []
    @Published private(set) var trackingAds: [TrackingAd] = []
    @Published private(set) var sections: [HomeCategorySection] = []
    @Published private(set) var cities: [City] = []
    @Published private(set) var isLoading = true
    @Published var errorMessage: String?

    private let api = DeliveraAPI()

    var cuisines: [String] {
        let values = restaurants.flatMap { Self.cuisineTokens(from: $0.cuisine) }
        return ["Alla"] + Array(Set(values)).sorted().prefix(8)
    }

    func load() async {
        isLoading = true
        errorMessage = nil

        async let restaurantRequest = result { try await api.restaurants() }
        async let sponsorRequest = result { try await api.sponsors() }
        async let adRequest = result { try await api.trackingAds() }
        async let sectionRequest = result { try await api.homeSections() }
        async let cityRequest = result { try await api.cities() }

        let restaurantResult = await restaurantRequest
        let sponsorResult = await sponsorRequest
        let adResult = await adRequest
        let sectionResult = await sectionRequest
        let cityResult = await cityRequest

        if case .success(let nextRestaurants) = restaurantResult {
            restaurants = nextRestaurants.sortedForHome()
        }
        if case .success(let nextSponsors) = sponsorResult {
            sponsors = nextSponsors.filter { $0.isActive != false }
        }
        if case .success(let nextAds) = adResult {
            trackingAds = nextAds
                .filter { $0.isActive != false }
                .sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
        }
        if case .success(let nextSections) = sectionResult {
            sections = nextSections.filter { $0.isActive }
        }
        if case .success(let nextCities) = cityResult {
            cities = nextCities.filter { $0.isActive }
        }

        if restaurants.isEmpty, case .failure = restaurantResult {
            errorMessage = "Kunde inte hämta data. Kontrollera att API:t kör på samma Wi-Fi."
        } else {
            errorMessage = nil
        }

        isLoading = false
    }

    func filteredRestaurants(cuisine: String, searchQuery: String, cityName: String?) -> [Restaurant] {
        filter(restaurants, cuisine: cuisine, searchQuery: searchQuery, cityName: cityName)
    }

    func restaurants(for section: HomeCategorySection, cityName: String?) -> [Restaurant] {
        var result = restaurants

        if !section.manualRestaurantIds.isEmpty {
            let ids = Set(section.manualRestaurantIds)
            let manual = restaurants.filter { ids.contains($0.id) }
            result = section.filterMode == "MANUAL" ? manual : (manual + result)
        }

        if let searchTerm = section.filters.searchTerm?.lowercased(), !searchTerm.isEmpty {
            result = result.filter {
                $0.name.lowercased().contains(searchTerm) ||
                ($0.cuisine?.lowercased().contains(searchTerm) ?? false) ||
                ($0.tags ?? []).contains { $0.lowercased().contains(searchTerm) }
            }
        }

        if !section.filters.cuisines.isEmpty {
            let cuisines = Set(section.filters.cuisines.map { $0.lowercased() })
            result = result.filter { cuisines.contains(($0.cuisine ?? "").lowercased()) }
        }

        if !section.filters.featuredClasses.isEmpty {
            let classes = Set(section.filters.featuredClasses)
            result = result.filter { classes.contains($0.featuredClass ?? 99) }
        }

        if let maxEta = section.filters.maxEtaMinutes {
            result = result.filter { ($0.etaMinutes ?? 30) <= maxEta }
        }

        if section.filters.freeDeliveryOnly {
            result = result.filter { ($0.deliveryFee ?? 0) <= 0 }
        }

        if section.filters.openNowOnly {
            result = result.filter { $0.isOpen != false }
        }

        result = filter(result, cuisine: "Alla", searchQuery: "", cityName: cityName)

        return Array(result.uniqued().sortedForHome().prefix(section.maxRestaurants))
    }

    private func filter(_ source: [Restaurant], cuisine: String, searchQuery: String, cityName: String?) -> [Restaurant] {
        var result = source

        if let cityName, !cityName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            result = result.filter { restaurant in
                guard let city = restaurant.city else { return true }
                return city.localizedCaseInsensitiveContains(cityName) || cityName.localizedCaseInsensitiveContains(city)
            }
        }

        if cuisine != "Alla" {
            result = result.filter { restaurant in
                let cuisines = Self.cuisineTokens(from: restaurant.cuisine)
                return cuisines.contains { $0.localizedCaseInsensitiveCompare(cuisine) == .orderedSame } ||
                    (restaurant.tags ?? []).contains { $0.localizedCaseInsensitiveContains(cuisine) }
            }
        }

        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        if !query.isEmpty {
            result = result.filter { restaurant in
                restaurant.name.localizedCaseInsensitiveContains(query) ||
                (restaurant.cuisine?.localizedCaseInsensitiveContains(query) ?? false) ||
                (restaurant.tags ?? []).contains { $0.localizedCaseInsensitiveContains(query) }
            }
        }

        return result.sortedForHome()
    }

    private static func cuisineTokens(from value: String?) -> [String] {
        guard let value else { return [] }
        let normalized = value
            .replacingOccurrences(of: " och ", with: ",", options: [.caseInsensitive])
            .replacingOccurrences(of: "/", with: ",")
            .replacingOccurrences(of: "&", with: ",")
        return normalized
            .split(separator: ",")
            .map { token in
                token.trimmingCharacters(in: .whitespacesAndNewlines).capitalized
            }
            .filter { !$0.isEmpty }
    }

    private func result<T>(_ operation: () async throws -> T) async -> Result<T, Error> {
        do {
            return .success(try await operation())
        } catch {
            return .failure(error)
        }
    }
}
