package se.delivera.android.data

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateOf
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Android equivalent of the SwiftUI @AppStorage keys + the Keychain-backed
 * auth token (SessionStore). General keys are backed by SharedPreferences;
 * the auth token lives in EncryptedSharedPreferences (Keychain parity) and is
 * exposed as an observable so views recompose on login/logout.
 */
object Prefs {
    private lateinit var sp: SharedPreferences
    private lateinit var secure: SharedPreferences

    private const val SECURE_FILE = "delivera.secure"

    fun init(context: Context) {
        val app = context.applicationContext
        sp = app.getSharedPreferences("delivera", Context.MODE_PRIVATE)
        secure = createSecurePrefs(app)
        migrateLegacyToken()
        authTokenState.value = secure.getString(KEY_AUTH_TOKEN, "") ?: ""
    }

    // Keys mirror the SwiftUI @AppStorage identifiers.
    const val KEY_AUTH_TOKEN = "delivera.authToken"
    const val KEY_DELIVERY_ADDRESS = "delivera.deliveryAddress"
    const val KEY_DELIVERY_CITY = "delivera.deliveryCityName"
    const val KEY_PICKUP_CITY = "delivera.pickupCityName"
    const val KEY_DELIVERY_LAT = "delivera.deliveryLatitude"
    const val KEY_DELIVERY_LNG = "delivera.deliveryLongitude"
    const val KEY_RECENT_DELIVERY_ADDRESSES = "delivera.recentDeliveryAddresses"
    const val KEY_FAVORITES = "delivera.favoriteRestaurantIDs"
    const val KEY_GUEST_PHONE = "delivera.cart.guestPhone"
    const val KEY_CART_GUEST_NAME = "delivera.cart.guestName"
    const val KEY_CART_NOTE = "delivera.cart.note"
    const val KEY_ACTIVE_ORDER_ID = "delivera.activeOrderId"
    const val KEY_ACTIVE_ORDER_PHONE = "delivera.activeOrderPhone"
    const val KEY_ACTIVE_ORDER_TOKEN = "delivera.activeOrderToken"
    const val KEY_ACTIVE_ORDER_TERMINAL_AT = "delivera.activeOrderTerminalAt"
    const val KEY_SKIPPED_REVIEW_ORDER_IDS = "delivera.skippedReviewOrderIds"
    const val KEY_ZONE_RESTAURANTS = "delivera.zoneRestaurants"
    const val KEY_ACTIVE_USER_DEAL_ID = "delivera.activeUserDealId"
    const val KEY_ACTIVE_USER_DEAL_SNAPSHOT = "delivera.activeUserDealSnapshot"
    const val KEY_HAS_SEEN_ONBOARDING = "delivera.hasSeenOnboarding"

    val authTokenState = mutableStateOf("")

    var authToken: String
        get() = authTokenState.value
        set(value) {
            authTokenState.value = value
            secure.edit().putString(KEY_AUTH_TOKEN, value).apply()
        }

    // OAuth-konton (Google/Apple) måste länka ett verifierat telefonnummer innan
    // de når skyddade endpoints (backend requireVerifiedPhone). Sätts efter
    // Supabase-OAuth-utbytet; profil-skärmen visar då länka-nummer-steget.
    val needsPhoneLinkState = mutableStateOf(false)

    // Supabase-access-token från OAuth-sessionen. Behövs för /api/profile/
    // link-phone (authenticateUser validerar Supabase-token, inte platform-JWT).
    // Transient, i minnet, bara relevant under länka-nummer-steget.
    val oauthSupabaseTokenState = mutableStateOf("")

    fun getString(key: String, default: String): String = sp.getString(key, default) ?: default
    fun setString(key: String, value: String) = sp.edit().putString(key, value).apply()

    fun getDouble(key: String, default: Double): Double =
        java.lang.Double.longBitsToDouble(sp.getLong(key, java.lang.Double.doubleToRawLongBits(default)))

    fun setDouble(key: String, value: Double) =
        sp.edit().putLong(key, java.lang.Double.doubleToRawLongBits(value)).apply()

    /** Silent migration of the old plaintext token into encrypted storage. */
    private fun migrateLegacyToken() {
        val legacy = sp.getString(KEY_AUTH_TOKEN, null) ?: return
        if (legacy.isNotEmpty() && (secure.getString(KEY_AUTH_TOKEN, "") ?: "").isEmpty()) {
            secure.edit().putString(KEY_AUTH_TOKEN, legacy).apply()
        }
        sp.edit().remove(KEY_AUTH_TOKEN).apply()
    }

    private fun createSecurePrefs(context: Context): SharedPreferences {
        return runCatching { buildEncrypted(context) }.getOrElse {
            // Keystore/file corruption: drop the broken file and rebuild rather
            // than crash on launch. Worst case the user logs in again.
            runCatching { context.deleteSharedPreferences(SECURE_FILE) }
            runCatching { buildEncrypted(context) }.getOrElse {
                context.getSharedPreferences("$SECURE_FILE.fallback", Context.MODE_PRIVATE)
            }
        }
    }

    private fun buildEncrypted(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context,
            SECURE_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }
}
