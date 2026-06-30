import Foundation

struct DeliveraAPI {
    var baseURL = AppConfig.apiBaseURL
    private let decoder: JSONDecoder = .delivera

    func restaurants() async throws -> [Restaurant] {
        try await get(
            "/api/restaurants",
            queryItems: [
                URLQueryItem(name: "_t", value: String(Int(Date().timeIntervalSince1970 * 1000)))
            ]
        )
    }

    func sponsors() async throws -> [Sponsor] {
        try await get("/api/sponsors")
    }

    func trackingAds() async throws -> [TrackingAd] {
        try await get("/api/ads")
    }

    func settings() async throws -> PlatformSettings {
        try await get("/api/settings")
    }

    func homeSections() async throws -> [HomeCategorySection] {
        try await get("/api/home-categories")
    }

    func cities() async throws -> [City] {
        try await get("/api/cities")
    }

    func restaurant(slug: String) async throws -> Restaurant {
        try await get("/api/restaurants/\(slug)")
    }

    func menu(slug: String) async throws -> MenuResponse {
        try await get(
            "/api/menu/categories",
            queryItems: [
                URLQueryItem(name: "slug", value: slug),
                URLQueryItem(name: "v", value: "swift")
            ]
        )
    }

    func validateLocation(latitude: Double, longitude: Double) async throws -> ZoneValidationResponse {
        try await post(
            "/api/cities/validate-location",
            body: ZoneValidationRequest(lat: latitude, lng: longitude)
        )
    }

    func restaurantReviews(slug: String) async throws -> RestaurantReviewsResponse {
        try await get("/api/restaurants/\(slug)/reviews")
    }

    func dpointsMe() async throws -> DpointsMe {
        try await get("/api/dpoints/me")
    }

    func dpointsMeDetailed() async throws -> RewardsMe {
        try await get("/api/dpoints/me")
    }

    func dpointsRewards() async throws -> DpointsRewardsResponse {
        try await get("/api/dpoints/rewards")
    }

    func dpointsRewardProducts(forceRefresh: Bool = false) async throws -> DpointsRewardProductsResponse {
        try await get(
            "/api/dpoints/reward-products",
            queryItems: forceRefresh ? [URLQueryItem(name: "refresh", value: "1")] : []
        )
    }

    func claimDpointsSignupBonus() async throws -> DpointsMe {
        try await postWithServerMessage("/api/dpoints/claim-signup", body: EmptyAPIRequest())
    }

    func claimDpointsSignupBonusDetailed() async throws -> RewardsMe {
        try await postWithServerMessage("/api/dpoints/claim-signup", body: EmptyAPIRequest())
    }

    func validateDiscount(code: String, subtotal: Double) async throws -> DiscountValidationResponse {
        try await postWithServerMessage(
            "/api/discount/validate",
            body: DiscountValidationRequest(code: code, subtotal: subtotal)
        )
    }

    func createOrder(_ request: CartOrderRequest, idempotencyKey: String) async throws -> CartOrderResponse {
        try await postWithServerMessage(
            "/api/orders",
            body: request,
            headers: ["Idempotency-Key": idempotencyKey]
        )
    }

    func customerOrder(id: String, phone: String? = nil, token: String? = nil) async throws -> CustomerOrderResponse {
        var queryItems: [URLQueryItem] = []
        if let phone, !phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            queryItems.append(URLQueryItem(name: "phone", value: phone))
        }
        if let token, !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            queryItems.append(URLQueryItem(name: "token", value: token))
        }
        queryItems.append(URLQueryItem(name: "_t", value: String(Int(Date().timeIntervalSince1970 * 1000))))
        return try await get("/api/orders/\(id)", queryItems: queryItems)
    }

    func createAdyenPayment(orderId: String, returnURL: String) async throws -> AdyenPaymentCreateResponse {
        try await postWithServerMessage(
            "/api/payments/create",
            body: AdyenPaymentCreateRequest(
                orderId: orderId,
                returnUrl: returnURL,
                channel: "iOS",
                storePaymentMethod: false
            )
        )
    }

    func verifyAdyenPayment(orderId: String, sessionId: String, sessionResult: String) async throws -> AdyenVerifyResponse {
        try await postWithServerMessage(
            "/api/payments/adyen/verify",
            body: AdyenVerifyRequest(orderId: orderId, sessionId: sessionId, sessionResult: sessionResult)
        )
    }

    func registerLiveActivityToken(orderId: String, token: String) async throws {
        let _: EmptyAPIResponse? = try await postWithServerMessage(
            "/api/orders/\(orderId)/live-activity-token",
            body: LiveActivityTokenRequest(token: token)
        )
    }

    func abandonOrder(orderId: String, phone: String) async {
        let request = AbandonOrderRequest(phone: phone.isEmpty ? nil : phone)
        let _: EmptyAPIResponse? = try? await postWithServerMessage(
            "/api/orders/\(orderId)/abandon",
            body: request
        )
    }

    func autocompletePlaces(input: String, sessionToken: String) async throws -> [PlacePrediction] {
        guard input.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 else { return [] }
        let response: PlacesAutocompleteResponse = try await get(
            "/api/places/autocomplete",
            queryItems: [
                URLQueryItem(name: "input", value: input),
                URLQueryItem(name: "sessiontoken", value: sessionToken)
            ]
        )
        return response.predictions
    }

    func geocodePlace(placeID: String, sessionToken: String) async throws -> PlaceGeocodeResponse {
        try await get(
            "/api/places/geocode",
            queryItems: [
                URLQueryItem(name: "place_id", value: placeID),
                URLQueryItem(name: "sessiontoken", value: sessionToken)
            ]
        )
    }

    func reverseGeocode(latitude: Double, longitude: Double) async throws -> ReverseGeocodeResponse {
        try await get(
            "/api/places/reverse",
            queryItems: [
                URLQueryItem(name: "lat", value: String(latitude)),
                URLQueryItem(name: "lng", value: String(longitude))
            ]
        )
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        try await get(path, queryItems: [])
    }

    private func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]) async throws -> T {
        var components = URLComponents(url: baseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))), resolvingAgainstBaseURL: false)
        components?.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components?.url else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = 15
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.requestFailed(http.statusCode) }
        return try decoder.decode(T.self, from: data)
    }

    private func post<T: Decodable, Body: Encodable>(_ path: String, body: Body) async throws -> T {
        let url = baseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.requestFailed(http.statusCode) }
        return try decoder.decode(T.self, from: data)
    }

    private func postWithServerMessage<T: Decodable, Body: Encodable>(
        _ path: String,
        body: Body,
        headers: [String: String] = [:]
    ) async throws -> T {
        let url = baseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if let error = try? decoder.decode(ServerErrorResponse.self, from: data), !error.error.isEmpty {
                throw APIError.message(error.error)
            }
            throw APIError.requestFailed(http.statusCode)
        }
        return try decoder.decode(T.self, from: data)
    }
}

private struct ServerErrorResponse: Decodable {
    let error: String
}

private struct EmptyAPIRequest: Encodable {}

extension JSONDecoder {
    static var delivera: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .useDefaultKeys
        return decoder
    }
}
