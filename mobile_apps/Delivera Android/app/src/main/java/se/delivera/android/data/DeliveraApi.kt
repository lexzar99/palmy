package se.delivera.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ApiException(message: String) : Exception(message)

val deliveraJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
}

/** Public reified decode helper. Only touches the public [deliveraJson]. */
inline fun <reified T> decodeDelivera(body: String): T = deliveraJson.decodeFromString(body)

/**
 * Port of DeliveraAPI.swift. Same endpoints, query params, no-cache headers and
 * bearer handling. Errors surface the server "error" field when present,
 * matching the Swift APIError.message behaviour.
 */
class DeliveraApi(private val baseUrl: String = AppConfig.apiBaseURL) {

    private val client = OkHttpClient.Builder()
        .callTimeout(15, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json".toMediaType()

    private fun now() = System.currentTimeMillis().toString()

    suspend fun restaurants(): List<Restaurant> =
        decodeDelivera(getRaw("/api/restaurants", mapOf("_t" to now())))

    suspend fun sponsors(): List<Sponsor> = decodeDelivera(getRaw("/api/sponsors"))

    suspend fun homeAppDeals(isLoggedIn: Boolean, token: String?): HomeAppDealsResponse {
        return appDeals("HOME_TOP", 8, isLoggedIn, token)
    }

    suspend fun appDeals(placement: String, limit: Int = 8, isLoggedIn: Boolean, token: String?): HomeAppDealsResponse {
        val headers = mutableMapOf<String, String>()
        if (!token.isNullOrBlank()) headers["Authorization"] = "Bearer $token"
        return decodeDelivera(
            getRaw(
                "/api/deals/app",
                mapOf(
                    "placement" to placement,
                    "limit" to limit.toString(),
                    "loggedIn" to if (isLoggedIn) "1" else "0",
                    "_t" to now()
                ),
                headers
            )
        )
    }

    suspend fun claimHomeAppDeal(id: String, token: String): HomeAppDealClaimResponse =
        decodeDelivera(postRaw("/api/deals/app/$id/claim", "{}", bearer(token)))

    suspend fun trackingAds(): List<TrackingAd> = decodeDelivera(getRaw("/api/ads"))

    suspend fun homePulse(token: String?): HomePulseResponse {
        val headers = mutableMapOf<String, String>()
        if (!token.isNullOrBlank()) headers["Authorization"] = "Bearer $token"
        return decodeDelivera(getRaw("/api/home/pulse", mapOf("_t" to now()), headers))
    }

    suspend fun settings(): PlatformSettings = decodeDelivera(getRaw("/api/settings"))

    suspend fun homeSections(): List<HomeCategorySection> = decodeDelivera(getRaw("/api/home-categories"))

    suspend fun cities(): List<City> = decodeDelivera(getRaw("/api/cities"))

    suspend fun restaurant(slug: String): Restaurant = decodeDelivera(getRaw("/api/restaurants/$slug"))

    suspend fun menu(slug: String): MenuResponse =
        decodeDelivera(getRaw("/api/menu/categories", mapOf("slug" to slug, "v" to "swift")))

    suspend fun restaurantReviews(slug: String): RestaurantReviewsResponse =
        decodeDelivera(getRaw("/api/restaurants/$slug/reviews"))

    suspend fun dpointsMe(): DpointsMe = decodeDelivera(getRaw("/api/dpoints/me"))

    suspend fun autocompletePlaces(input: String, sessionToken: String): List<PlacePrediction> {
        if (input.trim().length < 3) return emptyList()
        val response: PlacesAutocompleteResponse = decodeDelivera(
            getRaw(
                "/api/places/autocomplete",
                mapOf("input" to input, "sessiontoken" to sessionToken)
            )
        )
        return response.predictions
    }

    suspend fun geocodePlace(placeId: String, sessionToken: String): PlaceGeocodeResponse =
        decodeDelivera(
            getRaw(
                "/api/places/geocode",
                mapOf("place_id" to placeId, "sessiontoken" to sessionToken)
            )
        )

    suspend fun reverseGeocode(latitude: Double, longitude: Double): ReverseGeocodeResponse =
        decodeDelivera(
            getRaw(
                "/api/places/reverse",
                mapOf("lat" to latitude.toString(), "lng" to longitude.toString())
            )
        )

    // Profile & Rewards endpoints are added alongside those screens (exact
    // response models live in ProfileModels.kt / RewardsModels.kt).

    fun bearer(token: String) = mapOf("Authorization" to "Bearer $token")

    /* ------------------------- transport ------------------------- */

    suspend fun getRaw(
        path: String,
        query: Map<String, String> = emptyMap(),
        headers: Map<String, String> = emptyMap()
    ): String = withContext(Dispatchers.IO) {
        val urlBuilder = (baseUrl.trimEnd('/') + "/" + path.trim('/')).toHttpUrl().newBuilder()
        query.forEach { (k, v) -> urlBuilder.addQueryParameter(k, v) }
        val builder = Request.Builder()
            .url(urlBuilder.build())
            .header("Cache-Control", "no-cache")
            .header("Pragma", "no-cache")
        headers.forEach { (k, v) -> builder.header(k, v) }
        execute(builder.build())
    }

    suspend fun postRaw(
        path: String,
        bodyJson: String,
        headers: Map<String, String> = emptyMap()
    ): String = withContext(Dispatchers.IO) {
        val url = (baseUrl.trimEnd('/') + "/" + path.trim('/'))
        val builder = Request.Builder()
            .url(url)
            .post(bodyJson.toRequestBody(jsonMedia))
            .header("Content-Type", "application/json")
            .header("Cache-Control", "no-cache")
            .header("Pragma", "no-cache")
        headers.forEach { (k, v) -> builder.header(k, v) }
        execute(builder.build())
    }

    private fun execute(request: Request): String {
        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val serverMessage = runCatching {
                    deliveraJson.decodeFromString<ServerError>(body).error
                }.getOrNull()
                if (!serverMessage.isNullOrEmpty()) throw ApiException(serverMessage)
                throw ApiException("API-anropet misslyckades (${response.code}).")
            }
            return body
        }
    }
}

@kotlinx.serialization.Serializable
data class ServerError(val error: String = "")
