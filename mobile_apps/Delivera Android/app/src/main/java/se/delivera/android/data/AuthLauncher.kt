package se.delivera.android.data

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Supabase OAuth (Google/Apple) för native-appen, samma väg som webben.
 *
 * Flöde: öppna Supabase `/auth/v1/authorize` i webbläsaren → provider-login →
 * Supabase redirectar till webbens `/auth/callback` med `?code=` →
 * callbacken byter koden mot en session och redirectar till vår deep-link
 * `delivera://auth/callback?access_token=...&refresh_token=...` (native_redirect).
 * MainActivity fångar deep-linken och växlar Supabase-token mot en platform-token.
 */
object AuthLauncher {
    fun startOAuth(context: Context, provider: String) {
        // Webbens callback som gör kod→session-utbytet och sedan skickar tokens
        // vidare till appens deep-link.
        val webCallback = Uri.parse("${AppConfig.webOrigin}/auth/callback")
            .buildUpon()
            .appendQueryParameter("native_redirect", AppConfig.authCallbackDeepLink)
            .build()
            .toString()

        val scopes = if (provider == "apple") "name email" else "email profile openid"

        val authorize = Uri.parse("${AppConfig.supabaseURL}/auth/v1/authorize")
            .buildUpon()
            .appendQueryParameter("provider", provider)
            .appendQueryParameter("redirect_to", webCallback)
            .appendQueryParameter("scopes", scopes)
            .build()

        val intent = Intent(Intent.ACTION_VIEW, authorize).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
