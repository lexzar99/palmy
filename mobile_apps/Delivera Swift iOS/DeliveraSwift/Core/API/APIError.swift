import Foundation

enum APIError: LocalizedError {
    case invalidResponse
    case requestFailed(Int)
    case message(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Ogiltigt svar från API:t."
        case .requestFailed(let status):
            return "API-anropet misslyckades (\(status))."
        case .message(let text):
            return text
        }
    }
}
