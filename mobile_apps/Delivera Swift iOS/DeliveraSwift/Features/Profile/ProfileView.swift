import AuthenticationServices
import SwiftUI

struct ProfileView: View {
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
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var appeared = false

    private let api = ProfileAuthAPI()

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    if let profile {
                        loggedInView(profile)
                    } else {
                        loggedOutView
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 118)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 18)
            }
        }
        .task {
            withAnimation(.spring(response: 0.54, dampingFraction: 0.86)) {
                appeared = true
            }
            await restoreProfile()
        }
        .sheet(item: $activePanel) { panel in
            ProfilePanelSheet(
                panel: panel,
                profile: profile,
                editName: $editName,
                editEmail: $editEmail,
                isLoading: isLoading,
                errorMessage: errorMessage,
                onSaveProfile: { Task { await saveProfile() } }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    private var loggedOutView: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Profil")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                Text("Fortsätt med telefon, Apple eller Google. Kontot kopplas alltid till ditt verifierade nummer.")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 10) {
                AuthMethodButton(symbol: "phone.fill", title: "Fortsätt med telefon", subtitle: "Verifiera med SMS", tint: DeliveraTheme.orange) {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) {
                        authStep = .phone
                        errorMessage = nil
                    }
                }

                AppleSignInButton { result in
                    Task { await handleApple(result) }
                }
                .frame(height: 58)

                AuthMethodButton(symbol: "g.circle.fill", title: "Fortsätt med Google", subtitle: "Öppnas säkert via Supabase", tint: DeliveraTheme.ink) {
                    Task { await startGoogle() }
                }
            }

            authFlowCard

            if let errorMessage {
                NoticeBanner(text: errorMessage)
            }

            ProfileInfoLink()
        }
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

            HStack(spacing: 10) {
                ProfileMetric(title: "Status", value: profile.isVerified ? "Verifierad" : "Ej klar", symbol: "checkmark.seal.fill", tint: profile.isVerified ? .green : DeliveraTheme.orange)
                ProfileMetric(title: "Dpoints", value: "Kommer", symbol: "diamond.fill", tint: DeliveraTheme.orange)
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
            errorMessage = error.localizedDescription
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

private struct AuthMethodButton: View {
    let symbol: String
    let title: String
    let subtitle: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 19, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(tint, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            .padding(12)
            .background(.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

private struct AppleIdentityPayload {
    let identityToken: String
    let userIdentifier: String
    let email: String?
    let fullName: String?
}

private struct AppleSignInButton: UIViewRepresentable {
    let onResult: (Result<AppleIdentityPayload, Error>) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onResult: onResult)
    }

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: .continue, style: .black)
        button.cornerRadius = 18
        button.addTarget(context.coordinator, action: #selector(Coordinator.start), for: .touchUpInside)
        return button
    }

    func updateUIView(_ uiView: ASAuthorizationAppleIDButton, context: Context) {}

    final class Coordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
        let onResult: (Result<AppleIdentityPayload, Error>) -> Void

        init(onResult: @escaping (Result<AppleIdentityPayload, Error>) -> Void) {
            self.onResult = onResult
        }

        @objc func start() {
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
                  let token = String(data: data, encoding: .utf8) else {
                onResult(.failure(APIError.message("Apple kunde inte returnera en identitet.")))
                return
            }

            let name = PersonNameComponentsFormatter().string(from: credential.fullName ?? PersonNameComponents()).trimmingCharacters(in: .whitespacesAndNewlines)
            onResult(.success(AppleIdentityPayload(
                identityToken: token,
                userIdentifier: credential.user,
                email: credential.email,
                fullName: name.isEmpty ? nil : name
            )))
        }

        func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
            onResult(.failure(error))
        }
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

private struct ProfileInfoLink: View {
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 15, weight: .black))
            Text("Information, villkor och support finns i profilen efter inloggning.")
                .font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(DeliveraTheme.muted)
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ProfilePanelSheet: View {
    let panel: ProfilePanel
    let profile: CustomerProfile?
    @Binding var editName: String
    @Binding var editEmail: String
    let isLoading: Bool
    let errorMessage: String?
    let onSaveProfile: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                switch panel {
                case .deals:
                    PlaceholderPanel(symbol: "ticket.fill", title: "Mina deals", message: "Dina sparade deals och personliga koder visas här när vi kopplar listan mot `/api/profile/deals`.")
                case .orders:
                    PlaceholderPanel(symbol: "clock.arrow.circlepath", title: "Orderhistorik", message: "Här kommer tidigare ordrar, kvitton och recensioner ligga. Aktiva ordrar fortsätter visas på startsidan.")
                case .information:
                    PlaceholderPanel(symbol: "info.circle.fill", title: "Information", message: "Support, villkor, integritet och kontakt samlas här så profilen inte känns rörig.")
                case .settings:
                    settingsContent
                }
                Spacer()
            }
            .padding(20)
            .background(DeliveraTheme.appBackground.ignoresSafeArea())
            .navigationTitle(panelTitle)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var panelTitle: String {
        switch panel {
        case .deals: return "Mina deals"
        case .orders: return "Orderhistorik"
        case .information: return "Information"
        case .settings: return "Inställningar"
        }
    }

    private var settingsContent: some View {
        VStack(alignment: .leading, spacing: 13) {
            Text("Profil")
                .font(.system(size: 20, weight: .black, design: .rounded))
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
