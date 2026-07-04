package se.delivera.android.data

/** 1:1 with AppConfig.swift. Defaults point at production api.delivera.se. */
object AppConfig {
    const val apiBaseURL = "https://api.delivera.se"
    // Webbens origin, används för Supabase OAuth-callbacken (delad med web).
    const val webOrigin = "https://delivera.se"
    // Native deep-link som webbens /auth/callback skickar tillbaka tokens till.
    const val authCallbackDeepLink = "delivera://auth/callback"
    const val adyenClientKey = "test_UXISGJQFT5HMVFEXRJZ4E3DWVA6MIVEC"
    const val adyenEnvironment = "test"
    const val supabaseURL = "https://qiviwmhunmqemqylmwkr.supabase.co"
    const val supabaseAnonKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdml3bWh1bm1xZW1xeWxtd2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODg1MjgsImV4cCI6MjA5MTY2NDUyOH0._4FkvtBpK27JOrh_NZhCEULDDpN8QqUFsyZBcypLK10"
}
