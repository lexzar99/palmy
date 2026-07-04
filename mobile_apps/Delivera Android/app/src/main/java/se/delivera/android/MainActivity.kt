package se.delivera.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.Prefs
import se.delivera.android.ui.DeliveraApp
import se.delivera.android.ui.theme.DeliveraAppTheme

class MainActivity : ComponentActivity() {
    private val api = DeliveraApi()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Prefs.init(applicationContext)
        handleDeepLink(intent)
        enableEdgeToEdge()
        setContent {
            DeliveraAppTheme {
                DeliveraApp()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "delivera") return

        // Supabase OAuth-callback: delivera://auth/callback?access_token=...&refresh_token=...
        if (data.host == "auth") {
            handleAuthCallback(data)
            return
        }

        val orderId = when {
            data.host == "order" -> data.pathSegments.firstOrNull()
            data.pathSegments.firstOrNull() == "order" -> data.pathSegments.getOrNull(1)
            else -> null
        }?.takeIf { it.isNotBlank() } ?: return
        Prefs.setString(Prefs.KEY_ACTIVE_ORDER_ID, orderId)
        Prefs.setString("delivera.pendingOrderId", "")
        data.getQueryParameter("token")?.takeIf { it.isNotBlank() }?.let {
            Prefs.setString(Prefs.KEY_ACTIVE_ORDER_TOKEN, it)
            Prefs.setString("delivera.pendingOrderToken", "")
        }
    }

    /** Byt Supabase-sessionen (från OAuth-callbacken) mot en platform-token. */
    private fun handleAuthCallback(data: Uri) {
        val accessToken = data.getQueryParameter("access_token")?.takeIf { it.isNotBlank() } ?: return
        Prefs.oauthSupabaseTokenState.value = accessToken
        lifecycleScope.launch {
            runCatching { api.exchangePhoneToken(accessToken) }
                .onSuccess { res ->
                    Prefs.authToken = res.token
                    // OAuth-konton utan verifierat nummer måste länka telefon
                    // innan skyddade endpoints släpper igenom dem.
                    Prefs.needsPhoneLinkState.value = res.user.needsPhone == true || res.user.phone.isNullOrBlank()
                }
        }
    }
}
