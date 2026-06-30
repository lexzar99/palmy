import Foundation

enum AppConfig {
    static let apiBaseURL = URL(string: ProcessInfo.processInfo.environment["DELIVERA_API_URL"] ?? "https://api.delivera.se")!
    static let adyenClientKey = ProcessInfo.processInfo.environment["ADYEN_CLIENT_KEY"] ?? "test_UXISGJQFT5HMVFEXRJZ4E3DWVA6MIVEC"
    static let adyenEnvironment = ProcessInfo.processInfo.environment["ADYEN_ENVIRONMENT"] ?? "test"
}
