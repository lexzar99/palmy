package se.delivera.android.data

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateOf

/**
 * Android equivalent of the SwiftUI @AppStorage keys + the Keychain-backed
 * auth token (SessionStore). Backed by SharedPreferences; the auth token is
 * exposed as an observable so views recompose on login/logout.
 */
object Prefs {
    private lateinit var sp: SharedPreferences

    fun init(context: Context) {
        sp = context.applicationContext.getSharedPreferences("delivera", Context.MODE_PRIVATE)
        authTokenState.value = sp.getString(KEY_AUTH_TOKEN, "") ?: ""
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
    const val KEY_ACTIVE_USER_DEAL_ID = "delivera.activeUserDealId"
    const val KEY_ACTIVE_USER_DEAL_SNAPSHOT = "delivera.activeUserDealSnapshot"

    val authTokenState = mutableStateOf("")

    var authToken: String
        get() = authTokenState.value
        set(value) {
            authTokenState.value = value
            sp.edit().putString(KEY_AUTH_TOKEN, value).apply()
        }

    fun getString(key: String, default: String): String = sp.getString(key, default) ?: default
    fun setString(key: String, value: String) = sp.edit().putString(key, value).apply()

    fun getDouble(key: String, default: Double): Double =
        java.lang.Double.longBitsToDouble(sp.getLong(key, java.lang.Double.doubleToRawLongBits(default)))

    fun setDouble(key: String, value: Double) =
        sp.edit().putLong(key, java.lang.Double.doubleToRawLongBits(value)).apply()
}
