import Foundation

enum AppConfig {
    static let apiBaseURL = URL(string: ProcessInfo.processInfo.environment["DELIVERA_API_URL"] ?? "https://api.delivera.se")!
    static let adyenClientKey = ProcessInfo.processInfo.environment["ADYEN_CLIENT_KEY"] ?? "test_UXISGJQFT5HMVFEXRJZ4E3DWVA6MIVEC"
    static let adyenEnvironment = ProcessInfo.processInfo.environment["ADYEN_ENVIRONMENT"] ?? "test"
    static let supabaseURL = URL(string: ProcessInfo.processInfo.environment["SUPABASE_URL"] ?? "https://qiviwmhunmqemqylmwkr.supabase.co")!
    static let supabaseAnonKey = ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdml3bWh1bm1xZW1xeWxtd2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODg1MjgsImV4cCI6MjA5MTY2NDUyOH0._4FkvtBpK27JOrh_NZhCEULDDpN8QqUFsyZBcypLK10"
}
