import AuthenticationServices
import SwiftUI

struct ProfileView: View {
    @Environment(\.openURL) private var openURL
    @AppStorage("delivera.authToken") private var authToken = ""
    @State private var profile: CustomerProfile?
    @State private var authStep: ProfileAuthStep = .start
    @State private var phone = ""
    @State private var code = ""
    @State private var pendingPhone = ""
    @State private var pendingOAuthToken = ""
    @State private var editName = ""
    @State private var editEmail = ""
    @State private var activePanel: ProfilePanel?
    @State private var profileOrders: [ProfileOrder] = []
    @State private var profileDeals: [ProfileDeal] = []
    @State private var isPanelLoading = false
    @State private var panelErrorMessage: String?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var appeared = false

    private let api = ProfileAuthAPI()

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()

            if let activePanel {
                ProfilePanelPage(
                    panel: activePanel,
                    profile: profile,
                    orders: profileOrders,
                    deals: profileDeals,
                    editName: $editName,
                    editEmail: $editEmail,
                    isLoading: activePanel == .settings ? isLoading : isPanelLoading,
                    errorMessage: activePanel == .settings ? errorMessage : panelErrorMessage,
                    onBack: { withAnimation(.spring(response: 0.36, dampingFraction: 0.88)) { self.activePanel = nil } },
                    onSaveProfile: { Task { await saveProfile() } }
                )
                .transition(.move(edge: .trailing).combined(with: .opacity))
                .task { await loadPanel(activePanel) }
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        if let profile {
                            loggedInView(profile)
                        } else {
                            loggedOutView
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, profile == nil ? 0 : 18)
                    .padding(.bottom, 118)
                    .frame(minHeight: profile == nil ? UIScreen.main.bounds.height - 120 : nil, alignment: profile == nil ? .center : .top)
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared ? 0 : 18)
                }
            }
        }
        .task {
            withAnimation(.spring(response: 0.54, dampingFraction: 0.86)) {
                appeared = true
            }
            await restoreProfile()
        }
    }

    private var loggedOutView: some View {
        VStack(alignment: .center, spacing: 18) {
            VStack(spacing: 8) {
                Text("Logga in")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                    .multilineTextAlignment(.center)
                Text("Fortsätt med telefon, Apple eller Google. Kontot kopplas säkert till ditt nummer.")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(DeliveraTheme.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, 8)

            VStack(spacing: 10) {
                SocialContinueButton(symbol: "phone.fill", title: "Fortsätt med telefon", foreground: DeliveraTheme.ink, background: .white, border: DeliveraTheme.line) {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) {
                        authStep = .phone
                        errorMessage = nil
                    }
                }

                AppleSignInButton { result in
                    Task { await handleApple(result) }
                }

                SocialContinueButton(symbol: "google.logo", title: "Fortsätt med Google", foreground: .white, background: DeliveraTheme.ink, border: .clear) {
                    Task { await startGoogle() }
                }
            }
            .frame(maxWidth: 360)

            authFlowCard

            if let errorMessage {
                NoticeBanner(text: errorMessage)
            }

            ProfileInfoLinks { url in openURL(url) }
        }
        .frame(maxWidth: .infinity)
    }

    private var authFlowCard: some View {
        Group {
            switch authStep {
            case .start:
                EmptyView()
            case .phone, .linkPhone:
                VStack(alignment: .leading, spacing: 12) {
                    Text(authStep == .phone ? "Telefonnummer" : "Lägg till nummer")
                        .font(.system(size: 17, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    HStack(spacing: 8) {
                        Text("+46")
                            .font(.system(size: 15, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                            .frame(width: 58, height: 50)
                            .background(DeliveraTheme.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        TextField("70 000 00 00", text: $phone)
                            .keyboardType(.phonePad)
                            .textContentType(.telephoneNumber)
                            .font(.system(size: 16, weight: .black))
                            .padding(.horizontal, 14)
                            .frame(height: 50)
                            .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    Button {
                        Task { await sendPhoneCode(forLinking: authStep == .linkPhone) }
                    } label: {
                        ProfilePrimaryLabel(title: isLoading ? "Skickar..." : "Skicka kod", symbol: "paperplane.fill")
                    }
                    .disabled(isLoading)
                }
                .profileCard()
            case .code:
                VStack(alignment: .leading, spacing: 12) {
                    Text("Ange SMS-koden")
                        .font(.system(size: 17, weight: .black, design: .rounded))
                    Text("Vi skickade en kod till \(pendingPhone).")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                    TextField("123456", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .font(.system(size: 24, weight: .black, design: .rounded))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 14)
                        .frame(height: 58)
                        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    Button {
                        Task { await verifyPhoneCode() }
                    } label: {
                        ProfilePrimaryLabel(title: isLoading ? "Verifierar..." : "Verifiera", symbol: "checkmark.seal.fill")
                    }
                    .disabled(isLoading || code.trimmingCharacters(in: .whitespacesAndNewlines).count < 4)
                    Button("Ändra nummer") {
                        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                            authStep = pendingOAuthToken.isEmpty ? .phone : .linkPhone
                            code = ""
                            errorMessage = nil
                        }
                    }
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
                    .frame(maxWidth: .infinity)
                }
                .profileCard()
            }
        }
    }

    private func loggedInView(_ profile: CustomerProfile) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(profile.displayName)
                        .font(.system(size: 31, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(profile.phone ?? profile.email ?? "Verifierad kund")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
                Spacer()
                Button("Ändra") {
                    editName = profile.name ?? ""
                    editEmail = profile.email ?? ""
                    activePanel = .settings
                }
                .font(.system(size: 13, weight: .black))
                .foregroundStyle(.white)
                .padding(.horizontal, 13)
                .frame(height: 38)
                .background(DeliveraTheme.ink, in: Capsule())
            }

            VStack(spacing: 10) {
                ProfileMenuRow(symbol: "ticket.fill", title: "Mina deals", subtitle: "Rabatter och sparade erbjudanden") { activePanel = .deals }
                ProfileMenuRow(symbol: "clock.arrow.circlepath", title: "Orderhistorik", subtitle: "Kvitton, recensioner och tidigare köp") { activePanel = .orders }
                ProfileMenuRow(symbol: "info.circle.fill", title: "Information", subtitle: "Villkor, integritet och support") { activePanel = .information }
                ProfileMenuRow(symbol: "gearshape.fill", title: "Inställningar", subtitle: "Namn, e-post och konto") {
                    editName = profile.name ?? ""
                    editEmail = profile.email ?? ""
                    activePanel = .settings
                }
            }

            Button(role: .destructive) {
                logout()
            } label: {
                Label("Logga ut", systemImage: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 14, weight: .black))
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    @MainActor
    private func restoreProfile() async {
        guard !authToken.isEmpty else { return }
        do {
            profile = try await api.profile(token: authToken)
        } catch {
            authToken = ""
            profile = nil
        }
    }

    @MainActor
    private func sendPhoneCode(forLinking: Bool) async {
        let normalized = normalizeSwedishPhone(phone)
        guard normalized.count >= 10 else {
            errorMessage = "Skriv ett giltigt telefonnummer."
            return
        }

        isLoading = true
        errorMessage = nil
        do {
            _ = try? await api.lookupPhone(normalized)
            try await api.sendPhoneOTP(phone: normalized)
            pendingPhone = normalized
            authStep = .code
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    private func verifyPhoneCode() async {
        isLoading = true
        errorMessage = nil
        do {
            let session = try await api.verifyPhoneOTP(phone: pendingPhone, code: code)
            if pendingOAuthToken.isEmpty {
                let platform = try await api.exchangePhoneToken(supabaseAccessToken: session.accessToken)
                authToken = platform.token
                profile = platform.user
            } else {
                let linked = try await api.linkPhone(phone: pendingPhone, token: pendingOAuthToken)
                authToken = pendingOAuthToken
                profile = linked.user
                pendingOAuthToken = ""
            }
            authStep = .start
            phone = ""
            code = ""
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    private func handleApple(_ result: Result<AppleIdentityPayload, Error>) async {
        isLoading = true
        errorMessage = nil
        do {
            let payload = try result.get()
            guard payload.identityToken.split(separator: ".").count == 3 else {
                throw APIError.message("Apple skickade ingen giltig inloggningstoken. Testa igen.")
            }
            let response = try await api.oauthToken(
                provider: "apple",
                idToken: payload.identityToken,
                email: payload.email,
                name: payload.fullName,
                providerId: payload.userIdentifier
            )
            authToken = response.token
            profile = response.user
            if (response.user.needsPhone ?? false) || response.user.phone == nil {
                pendingOAuthToken = response.token
                authStep = .linkPhone
            }
        } catch {
            if let authError = error as? ASAuthorizationError {
                if authError.code == .canceled {
                    errorMessage = nil
                } else {
                    errorMessage = "Apple kunde inte auktorisera inloggningen. Kontrollera att Sign in with Apple är aktivt för appen och testa igen."
                }
            } else {
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
    }

    @MainActor
    private func startGoogle() async {
        errorMessage = "Google native kopplas via Supabase OAuth nästa steg. Telefon och Apple är redo nu."
    }

    @MainActor
    private func saveProfile() async {
        guard !authToken.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        do {
            try await api.updateProfile(token: authToken, name: editName, email: editEmail)
            profile = try await api.profile(token: authToken)
            activePanel = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    private func loadPanel(_ panel: ProfilePanel) async {
        guard !authToken.isEmpty else { return }
        panelErrorMessage = nil
        switch panel {
        case .orders:
            isPanelLoading = true
            defer { isPanelLoading = false }
            do {
                profileOrders = try await DeliveraAPI().profileOrders(token: authToken)
            } catch {
                panelErrorMessage = error.localizedDescription
            }
        case .deals:
            isPanelLoading = true
            defer { isPanelLoading = false }
            do {
                profileDeals = try await DeliveraAPI().profileDeals(token: authToken)
            } catch {
                panelErrorMessage = error.localizedDescription
            }
        case .information, .settings:
            break
        }
    }

    private func logout() {
        authToken = ""
        profile = nil
        authStep = .start
        phone = ""
        code = ""
        pendingPhone = ""
        pendingOAuthToken = ""
    }

    private func normalizeSwedishPhone(_ raw: String) -> String {
        let digits = raw.filter(\.isNumber)
        if raw.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("+") {
            return "+\(digits)"
        }
        if digits.hasPrefix("46") {
            return "+\(digits)"
        }
        if digits.hasPrefix("0") {
            return "+46\(digits.dropFirst())"
        }
        return "+46\(digits)"
    }
}

private enum ProfileAuthStep {
    case start
    case phone
    case linkPhone
    case code
}

private enum ProfilePanel: String, Identifiable {
    case deals
    case orders
    case information
    case settings

    var id: String { rawValue }
}

private struct CustomerProfile: Codable, Hashable {
    let id: String
    let name: String?
    let firstName: String?
    let lastName: String?
    let phone: String?
    let email: String?
    let isVerified: Bool
    let image: String?
    let needsPhone: Bool?
    let needsName: Bool?
    let profileComplete: Bool?

    var displayName: String {
        let joined = [firstName, lastName].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.joined(separator: " ")
        if !joined.isEmpty { return joined }
        if let name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return name }
        return "Din profil"
    }
}

struct ProfileOrder: Decodable, Identifiable, Hashable {
    let id: String
    let orderNumber: String?
    let status: String
    let type: String?
    let total: Double
    let deliveryFee: Double?
    let discountAmount: Double?
    let tipAmount: Double?
    let deliveryStreet: String?
    let createdAt: String
    let restaurant: ProfileOrderRestaurant?
    let items: [ProfileOrderItem]

    var displayDate: String {
        String(createdAt.prefix(10))
    }

    var totalText: String {
        "\(Int(total.rounded())) kr"
    }

    var displayStatus: String {
        switch status.uppercased() {
        case "PENDING": return "Väntar"
        case "PREPARING", "ACCEPTED": return "Tillagas"
        case "READY": return "Redo"
        case "DELIVERING", "OUT_FOR_DELIVERY": return "På väg"
        case "DELIVERED", "COMPLETED": return "Levererad"
        case "CANCELLED", "CANCELED", "REJECTED": return "Avbruten"
        default: return status.capitalized
        }
    }

    var statusTint: Color {
        switch status.uppercased() {
        case "READY", "DELIVERED", "COMPLETED": return .green
        case "CANCELLED", "CANCELED", "REJECTED": return .red
        case "DELIVERING", "OUT_FOR_DELIVERY": return Color(red: 0.17, green: 0.49, blue: 0.90)
        default: return DeliveraTheme.orange
        }
    }

    var activeOrder: ActiveHomeOrder {
        let mode: OrderMode = (type ?? "").uppercased() == "PICKUP" ? .pickup : .delivery
        let restaurantName = restaurant?.name ?? "Restaurang"
        let addressParts = [restaurant?.address, restaurant?.zip, restaurant?.city]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        let orderLines = items.map { item in
            ActiveOrderLine(
                name: item.productName,
                quantity: item.quantity,
                unitPrice: item.basePrice,
                extras: item.selectedExtras.compactMap { extra in
                    let name = extra.extraName ?? extra.name
                    guard let name, !name.isEmpty else { return nil }
                    return "\(extra.quantity ?? 1)x \(name)"
                }
            )
        }
        return ActiveHomeOrder(
            id: id,
            accessToken: nil,
            orderNumber: orderNumber,
            restaurantName: restaurantName,
            restaurantLegalName: restaurant?.legalName,
            restaurantOrgNumber: restaurant?.organizationNumber,
            restaurantAddress: addressParts.joined(separator: ", "),
            restaurantPhone: restaurant?.phone,
            restaurantVatPercent: Double(restaurant?.vatPercent ?? 12),
            status: HomeTrackingStatus(apiStatus: status, mode: mode),
            statusTitle: displayStatus,
            statusSubtitle: "",
            etaText: displayStatus,
            etaEndsAt: nil,
            mode: mode,
            address: deliveryStreet ?? addressParts.joined(separator: ", "),
            total: total,
            deliveryFee: deliveryFee ?? 0,
            discountAmount: discountAmount ?? 0,
            items: orderLines,
            selfDelivery: false,
            courierName: nil,
            courierAssigned: false,
            courierHasLiveLocation: false,
            restaurantLatitude: 55.6046,
            restaurantLongitude: 13.0038,
            customerLatitude: 55.5969,
            customerLongitude: 13.0007,
            courierLatitude: 55.6046,
            courierLongitude: 13.0038
        )
    }
}

struct ProfileOrderRestaurant: Decodable, Hashable {
    let id: String?
    let name: String?
    let slug: String?
    let address: String?
    let zip: String?
    let city: String?
    let phone: String?
    let legalName: String?
    let organizationNumber: String?
    let vatPercent: Int?
}

struct ProfileOrderItem: Decodable, Identifiable, Hashable {
    let id: String
    let productName: String
    let basePrice: Double
    let quantity: Int
    let subtotal: Double
    let selectedExtras: [ProfileOrderExtra]
}

struct ProfileOrderExtra: Decodable, Hashable {
    let name: String?
    let extraName: String?
    let quantity: Int?
}

struct ProfileDeal: Decodable, Identifiable, Hashable {
    let id: String
    let code: String?
    let campaign: ProfileDealCampaign?

    var title: String {
        campaign?.title ?? campaign?.name ?? "Personlig deal"
    }

    var subtitle: String {
        if let code, !code.isEmpty {
            return "Kod: \(code)"
        }
        if let campaign {
            return campaign.displayDiscount
        }
        return "Redo att användas i kassan"
    }
}

struct ProfileDealCampaign: Decodable, Hashable {
    let title: String?
    let name: String?
    let discountType: String?
    let discountValue: Double?
    let minOrder: Double?

    var displayDiscount: String {
        let value = discountValue ?? 0
        if discountType == "PERCENTAGE" {
            return "\(Int(value.rounded()))% rabatt"
        }
        return "\(Int(value.rounded())) kr rabatt"
    }
}

private struct PhoneLookupResponse: Decodable {
    let exists: Bool
    let hasFullAccount: Bool
    let isVerified: Bool
}

private struct SupabaseOTPResponse: Decodable {}

private struct SupabaseSessionResponse: Decodable {
    let accessToken: String
    let refreshToken: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
    }
}

private struct PlatformAuthResponse: Decodable {
    let token: String
    let user: CustomerProfile
}

private struct LinkPhoneResponse: Decodable {
    let user: CustomerProfile
}

private struct ProfileAuthAPI {
    private let decoder: JSONDecoder = .delivera

    func lookupPhone(_ phone: String) async throws -> PhoneLookupResponse {
        try await postAPI("/api/auth/lookup-phone", body: ["phone": phone], token: nil)
    }

    func sendPhoneOTP(phone: String) async throws {
        let _: SupabaseOTPResponse = try await postSupabase("/auth/v1/otp", body: SupabaseOTPBody(phone: phone))
    }

    func verifyPhoneOTP(phone: String, code: String) async throws -> SupabaseSessionResponse {
        try await postSupabase("/auth/v1/verify", body: [
            "phone": phone,
            "token": code.trimmingCharacters(in: .whitespacesAndNewlines),
            "type": "sms"
        ])
    }

    func exchangePhoneToken(supabaseAccessToken: String) async throws -> PlatformAuthResponse {
        try await postAPI("/api/auth/phone-token", body: EmptyProfileBody(), token: supabaseAccessToken)
    }

    func oauthToken(provider: String, idToken: String, email: String?, name: String?, providerId: String) async throws -> PlatformAuthResponse {
        try await postAPI(
            "/api/auth/oauth-token",
            body: OAuthTokenBody(
                provider: provider,
                idToken: idToken,
                email: email,
                name: name,
                providerId: providerId
            ),
            token: nil
        )
    }

    func linkPhone(phone: String, token: String) async throws -> LinkPhoneResponse {
        try await postAPI("/api/profile/link-phone", body: ["phone": phone], token: token)
    }

    func profile(token: String) async throws -> CustomerProfile {
        try await getAPI("/api/profile", token: token)
    }

    func updateProfile(token: String, name: String, email: String) async throws {
        let _: ProfileUpdateResponse = try await patchAPI(
            "/api/profile",
            body: ProfileUpdateBody(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : email.trimmingCharacters(in: .whitespacesAndNewlines)
            ),
            token: token
        )
    }

    private func getAPI<T: Decodable>(_ path: String, token: String) async throws -> T {
        let url = AppConfig.apiBaseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15
        return try await perform(request)
    }

    private func postAPI<T: Decodable, Body: Encodable>(_ path: String, body: Body, token: String?) async throws -> T {
        var request = URLRequest(url: AppConfig.apiBaseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 18
        return try await perform(request)
    }

    private func patchAPI<T: Decodable, Body: Encodable>(_ path: String, body: Body, token: String) async throws -> T {
        var request = URLRequest(url: AppConfig.apiBaseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 18
        return try await perform(request)
    }

    private func postSupabase<T: Decodable, Body: Encodable>(_ path: String, body: Body) async throws -> T {
        var request = URLRequest(url: AppConfig.supabaseURL.appending(path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(AppConfig.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 18
        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if let error = try? decoder.decode(ProfileServerError.self, from: data), let message = error.displayMessage {
                throw APIError.message(message)
            }
            throw APIError.requestFailed(http.statusCode)
        }
        if T.self == SupabaseOTPResponse.self, data.isEmpty {
            return SupabaseOTPResponse() as! T
        }
        return try decoder.decode(T.self, from: data)
    }
}

private struct ProfileServerError: Decodable {
    let error: String?
    let msg: String?
    let detail: String?

    enum CodingKeys: String, CodingKey {
        case error
        case msg
        case detail = "message"
    }

    var displayMessage: String? { error ?? msg ?? detail }
}

private struct EmptyProfileBody: Encodable {}

private struct SupabaseOTPBody: Encodable {
    let phone: String
    let channel = "sms"
    let shouldCreateUser = true

    enum CodingKeys: String, CodingKey {
        case phone
        case channel
        case shouldCreateUser = "should_create_user"
    }
}

private struct OAuthTokenBody: Encodable {
    let provider: String
    let idToken: String
    let email: String?
    let name: String?
    let providerId: String
}

private struct ProfileUpdateBody: Encodable {
    let name: String
    let email: String?
}

private struct ProfileUpdateResponse: Decodable {
    let success: Bool?
}

private struct SocialContinueButton: View {
    let symbol: String
    let title: String
    let foreground: Color
    let background: Color
    let border: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if symbol == "google.logo" {
                    GoogleLogoMark(size: 19)
                        .frame(width: 22, height: 22)
                } else {
                    Image(systemName: symbol)
                        .font(.system(size: 18, weight: .black))
                        .frame(width: 22)
                }
                Text(title)
                    .font(.system(size: 16, weight: .black, design: .rounded))
            }
            .foregroundStyle(foreground)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .center)
            .frame(height: 56)
            .background(background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct GoogleLogoMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0.02, to: 0.26)
                .stroke(Color(red: 0.25, green: 0.52, blue: 0.96), style: StrokeStyle(lineWidth: size * 0.2, lineCap: .round))
                .rotationEffect(.degrees(-18))
            Circle()
                .trim(from: 0.28, to: 0.48)
                .stroke(Color(red: 0.20, green: 0.66, blue: 0.33), style: StrokeStyle(lineWidth: size * 0.2, lineCap: .round))
                .rotationEffect(.degrees(-18))
            Circle()
                .trim(from: 0.50, to: 0.70)
                .stroke(Color(red: 0.98, green: 0.74, blue: 0.18), style: StrokeStyle(lineWidth: size * 0.2, lineCap: .round))
                .rotationEffect(.degrees(-18))
            Circle()
                .trim(from: 0.72, to: 0.96)
                .stroke(Color(red: 0.91, green: 0.26, blue: 0.21), style: StrokeStyle(lineWidth: size * 0.2, lineCap: .round))
                .rotationEffect(.degrees(-18))
            Path { path in
                path.move(to: CGPoint(x: size * 0.52, y: size * 0.50))
                path.addLine(to: CGPoint(x: size * 0.94, y: size * 0.50))
            }
            .stroke(Color(red: 0.25, green: 0.52, blue: 0.96), style: StrokeStyle(lineWidth: size * 0.18, lineCap: .square))
        }
        .frame(width: size, height: size)
        .background(.white, in: Circle())
    }
}

private struct AppleIdentityPayload {
    let identityToken: String
    let userIdentifier: String
    let email: String?
    let fullName: String?
}

private struct AppleSignInButton: View {
    let onResult: (Result<AppleIdentityPayload, Error>) -> Void
    @StateObject private var coordinator = AppleSignInCoordinator()

    var body: some View {
        Button {
            coordinator.start(onResult: onResult)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "apple.logo")
                    .font(.system(size: 19, weight: .black))
                    .frame(width: 22)
                Text("Fortsätt med Apple")
                    .font(.system(size: 16, weight: .black, design: .rounded))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .center)
            .frame(height: 56)
            .background(DeliveraTheme.ink, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private final class AppleSignInCoordinator: NSObject, ObservableObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var onResult: ((Result<AppleIdentityPayload, Error>) -> Void)?

    func start(onResult: @escaping (Result<AppleIdentityPayload, Error>) -> Void) {
        self.onResult = onResult
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? UIWindow()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken,
              let token = String(data: data, encoding: .utf8),
              token.split(separator: ".").count == 3 else {
            onResult?(.failure(APIError.message("Apple kunde inte returnera en giltig identitet.")))
            return
        }

        let name = PersonNameComponentsFormatter().string(from: credential.fullName ?? PersonNameComponents()).trimmingCharacters(in: .whitespacesAndNewlines)
        onResult?(.success(AppleIdentityPayload(
            identityToken: token,
            userIdentifier: credential.user,
            email: credential.email,
            fullName: name.isEmpty ? nil : name
        )))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        onResult?(.failure(error))
    }
}

private struct ProfilePrimaryLabel: View {
    let title: String
    let symbol: String

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.system(size: 15, weight: .black))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(DeliveraTheme.orange, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ProfileMenuRow: View {
    let symbol: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .black))
                    .foregroundStyle(DeliveraTheme.orange)
                    .frame(width: 42, height: 42)
                    .background(DeliveraTheme.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            .padding(12)
            .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct ProfileMetric: View {
    let title: String
    let value: String
    let symbol: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(tint)
            Text(value)
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundStyle(DeliveraTheme.ink)
            Text(title)
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(DeliveraTheme.muted)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct ProfileInfoLinks: View {
    let open: (URL) -> Void

    var body: some View {
        HStack(spacing: 14) {
            link("Support", "https://delivera.se/contact")
            Text("•")
            link("Villkor", "https://delivera.se/terms")
            Text("•")
            link("Policy", "https://delivera.se/privacy")
        }
        .font(.system(size: 12, weight: .black))
        .foregroundStyle(DeliveraTheme.muted)
        .padding(.top, 4)
    }

    private func link(_ title: String, _ url: String) -> some View {
        Button(title) {
            if let url = URL(string: url) {
                open(url)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct ProfilePanelPage: View {
    @Environment(\.openURL) private var openURL
    let panel: ProfilePanel
    let profile: CustomerProfile?
    let orders: [ProfileOrder]
    let deals: [ProfileDeal]
    @Binding var editName: String
    @Binding var editEmail: String
    let isLoading: Bool
    let errorMessage: String?
    let onBack: () -> Void
    let onSaveProfile: () -> Void
    @State private var selectedOrder: ProfileOrder?

    var body: some View {
        Group {
            if let selectedOrder {
                ProfileOrderDetailPage(order: selectedOrder) {
                    withAnimation(.spring(response: 0.34, dampingFraction: 0.88)) {
                        self.selectedOrder = nil
                    }
                }
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 12) {
                            Button(action: onBack) {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 17, weight: .black))
                                    .foregroundStyle(DeliveraTheme.ink)
                                    .frame(width: 46, height: 46)
                                    .background(.white, in: Circle())
                                    .overlay(Circle().stroke(DeliveraTheme.line, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(panelTitle)
                                    .font(.system(size: 29, weight: .black, design: .rounded))
                                    .foregroundStyle(DeliveraTheme.ink)
                                Text(panelSubtitle)
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(DeliveraTheme.muted)
                            }
                            Spacer()
                        }

                        switch panel {
                        case .deals:
                            dealsContent
                        case .orders:
                            ordersContent
                        case .information:
                            informationContent
                        case .settings:
                            settingsContent
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 18)
                    .padding(.bottom, 118)
                }
            }
        }
        .background(DeliveraTheme.appBackground.ignoresSafeArea())
    }

    private var panelTitle: String {
        switch panel {
        case .deals: return "Mina deals"
        case .orders: return "Orderhistorik"
        case .information: return "Information"
        case .settings: return "Inställningar"
        }
    }

    private var panelSubtitle: String {
        switch panel {
        case .deals: return "Personliga rabatter och erbjudanden"
        case .orders: return "Tidigare köp, kvitton och recensioner"
        case .information: return "Support, villkor och trygghet"
        case .settings: return "Namn och e-post"
        }
    }

    @ViewBuilder
    private var dealsContent: some View {
        if isLoading {
            ProfileLoadingRows()
        } else if let errorMessage {
            NoticeBanner(text: errorMessage)
        } else if deals.isEmpty {
            PlaceholderPanel(symbol: "ticket.fill", title: "Inga deals än", message: "När du får personliga erbjudanden hamnar de här direkt.")
        } else {
            VStack(spacing: 10) {
                ForEach(deals) { deal in
                    HStack(spacing: 12) {
                        Image(systemName: "ticket.fill")
                            .font(.system(size: 18, weight: .black))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(DeliveraTheme.orange, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(deal.title)
                                .font(.system(size: 15, weight: .black))
                                .foregroundStyle(DeliveraTheme.ink)
                                .lineLimit(1)
                            Text(deal.subtitle)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                                .lineLimit(2)
                        }
                        Spacer()
                    }
                    .padding(14)
                    .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                }
            }
        }
    }

    @ViewBuilder
    private var ordersContent: some View {
        if isLoading {
            ProfileLoadingRows()
        } else if let errorMessage {
            NoticeBanner(text: errorMessage)
        } else if orders.isEmpty {
            PlaceholderPanel(symbol: "clock.arrow.circlepath", title: "Ingen historik än", message: "När du beställer med ditt verifierade nummer visas ordern här.")
        } else {
            VStack(spacing: 10) {
                ForEach(orders) { order in
                    Button {
                        withAnimation(.spring(response: 0.34, dampingFraction: 0.88)) {
                            selectedOrder = order
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(order.restaurant?.name ?? "Restaurang")
                                        .font(.system(size: 16, weight: .black, design: .rounded))
                                        .foregroundStyle(DeliveraTheme.ink)
                                    Text(order.displayDate)
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(DeliveraTheme.muted)
                                }
                                Spacer()
                                Text(order.totalText)
                                    .font(.system(size: 16, weight: .black, design: .rounded))
                                    .foregroundStyle(DeliveraTheme.orange)
                            }
                            HStack(spacing: 8) {
                                ProfilePill(text: order.displayStatus, tint: order.statusTint)
                                ProfilePill(text: order.type == "PICKUP" ? "Avhämtning" : "Leverans", tint: DeliveraTheme.ink)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(DeliveraTheme.muted)
                            }
                        }
                        .padding(15)
                        .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var informationContent: some View {
        VStack(spacing: 10) {
            ProfileInfoRow(symbol: "bubble.left.and.bubble.right.fill", title: "Support", subtitle: "Kontakta oss om en order eller betalning.") {
                openURL(URL(string: "https://delivera.se/contact")!)
            }
            ProfileInfoRow(symbol: "shield.checkered", title: "Integritet", subtitle: "Hur vi hanterar konto, plats och betalningsdata.") {
                openURL(URL(string: "https://delivera.se/privacy")!)
            }
            ProfileInfoRow(symbol: "doc.text.fill", title: "Villkor", subtitle: "Köpvillkor, integritet och Dpoints-regler.") {
                openURL(URL(string: "https://delivera.se/terms")!)
            }
        }
    }

    private var settingsContent: some View {
        VStack(alignment: .leading, spacing: 13) {
            TextField("Namn", text: $editName)
                .profileInput()
            TextField("E-post", text: $editEmail)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .profileInput()
            VStack(alignment: .leading, spacing: 4) {
                Text("Telefonnummer")
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
                Text(profile?.phone ?? "Ej angivet")
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
                    .padding(.horizontal, 14)
                    .frame(height: 50)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(DeliveraTheme.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text("Numret är låst. För att byta nummer verifierar vi ett nytt SMS-flöde separat.")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            if let errorMessage {
                NoticeBanner(text: errorMessage)
            }
            Button(action: onSaveProfile) {
                ProfilePrimaryLabel(title: isLoading ? "Sparar..." : "Spara", symbol: "checkmark")
            }
            .disabled(isLoading)
        }
    }
}

private struct ProfileOrderDetailPage: View {
    let order: ProfileOrder
    let onBack: () -> Void
    @State private var platformSettings: PlatformSettings?
    @State private var exportFile: ReceiptExportFile?
    @State private var exportError: String?

    private var activeOrder: ActiveHomeOrder { order.activeOrder }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 12) {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                            .frame(width: 46, height: 46)
                            .background(.white, in: Circle())
                            .overlay(Circle().stroke(DeliveraTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(activeOrder.restaurantName)
                            .font(.system(size: 27, weight: .black, design: .rounded))
                            .foregroundStyle(DeliveraTheme.ink)
                            .lineLimit(1)
                        Text("\(activeOrder.displayOrderNumber) • \(order.displayDate)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                    }
                    Spacer()
                }

                VStack(alignment: .leading, spacing: 0) {
                    PlainTextLine(title: "Status", value: order.displayStatus)
                    Divider()
                    PlainTextLine(title: order.type == "PICKUP" ? "Avhämtning" : "Leverans", value: activeOrder.address)
                    if let legal = activeOrder.restaurantLegalName, !legal.isEmpty {
                        Divider()
                        PlainTextLine(title: "Juridiskt namn", value: legal)
                    }
                    if let org = activeOrder.restaurantOrgNumber, !org.isEmpty {
                        Divider()
                        PlainTextLine(title: "Org.nr", value: org)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
                .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))

                VStack(alignment: .leading, spacing: 12) {
                    Text("Artiklar")
                        .font(.system(size: 18, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    ForEach(activeOrder.items) { item in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text("\(item.quantity)x \(item.name)")
                                Spacer()
                                Text(priceText(item.total))
                            }
                            .font(.system(size: 14, weight: .black))
                            if !item.extras.isEmpty {
                                Text(item.extras.joined(separator: ", "))
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(DeliveraTheme.muted)
                            }
                        }
                    }
                    Divider()
                    ReceiptLine(title: "Delsumma", value: priceText(activeOrder.subtotal))
                    ReceiptLine(title: activeOrder.mode == .pickup ? "Avhämtning" : "Leverans", value: activeOrder.deliveryFee > 0 ? priceText(activeOrder.deliveryFee) : "Fri")
                    if activeOrder.discountAmount > 0 {
                        ReceiptLine(title: "Rabatt", value: "-\(priceText(activeOrder.discountAmount))", accent: .green)
                    }
                    ReceiptLine(title: "Varav moms \(formatNumber(activeOrder.restaurantVatPercent))%", value: priceText(activeOrder.vatAmount))
                    Divider()
                    HStack {
                        Text("Totalt")
                        Spacer()
                        Text(priceText(activeOrder.total))
                    }
                    .font(.system(size: 21, weight: .black, design: .rounded))

                    Button {
                        do {
                            exportFile = try makeReceiptPDF(order: activeOrder, settings: platformSettings)
                            exportError = nil
                        } catch {
                            exportError = error.localizedDescription
                        }
                    } label: {
                        HStack {
                            Text("Skapa nytt kvitto")
                            Spacer()
                            Image(systemName: "arrow.down.doc.fill")
                        }
                        .font(.system(size: 14, weight: .black))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 15)
                        .frame(height: 50)
                        .background(DeliveraTheme.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    if let exportError {
                        Text(exportError)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.red)
                    }
                }
                .padding(16)
                .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 118)
        }
        .background(DeliveraTheme.appBackground.ignoresSafeArea())
        .task {
            platformSettings = try? await DeliveraAPI().settings()
        }
        .sheet(item: $exportFile) { file in
            ShareSheet(activityItems: [file.url])
        }
    }
}

private struct ProfilePill: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .black))
            .foregroundStyle(tint)
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(tint.opacity(0.10), in: Capsule())
    }
}

private struct ProfileInfoRow: View {
    let symbol: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .black))
                    .foregroundStyle(DeliveraTheme.orange)
                    .frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            .padding(14)
            .background(.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct ProfileLoadingRows: View {
    var body: some View {
        VStack(spacing: 10) {
            ForEach(0..<4, id: \.self) { index in
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.white.opacity(0.86))
                    .frame(height: index == 0 ? 82 : 74)
                    .overlay(alignment: .leading) {
                        HStack(spacing: 12) {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(DeliveraTheme.orange.opacity(0.10))
                                .frame(width: 44, height: 44)
                            VStack(alignment: .leading, spacing: 8) {
                                Capsule().fill(Color.black.opacity(0.08)).frame(width: 160, height: 12)
                                Capsule().fill(Color.black.opacity(0.055)).frame(width: 110, height: 10)
                            }
                        }
                        .padding(14)
                    }
            }
        }
    }
}

private struct PlaceholderPanel: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 24, weight: .black))
                .foregroundStyle(DeliveraTheme.orange)
                .frame(width: 54, height: 54)
                .background(DeliveraTheme.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            Text(title)
                .font(.system(size: 25, weight: .black, design: .rounded))
                .foregroundStyle(DeliveraTheme.ink)
            Text(message)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(DeliveraTheme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .profileCard()
    }
}

private extension View {
    func profileCard() -> some View {
        padding(14)
            .background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }

    func profileInput() -> some View {
        self
            .font(.system(size: 15, weight: .black))
            .padding(.horizontal, 14)
            .frame(height: 50)
            .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}
