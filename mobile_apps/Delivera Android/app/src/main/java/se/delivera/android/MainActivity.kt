package se.delivera.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import se.delivera.android.data.Prefs
import se.delivera.android.ui.DeliveraApp
import se.delivera.android.ui.theme.DeliveraAppTheme

class MainActivity : ComponentActivity() {
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
}
