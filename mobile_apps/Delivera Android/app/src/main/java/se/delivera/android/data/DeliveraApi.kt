package se.delivera.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ApiException(message: String) : Exception(message)

@OptIn(ExperimentalSerializationApi::class)
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

    /** Kassans server-sanning för en aktiv deal. */
    suspend fun quoteAppDeal(request: AppDealQuoteRequest, token: String): AppDealQuoteResponse =
        decodeDelivera(postRaw("/api/deals/app/quote", deliveraJson.encodeToString(request), bearer(token)))

    /** Alla mina deals quotade mot varukorgen (kassans väljbara lista). */
    suspend fun myDeals(request: MyDealsRequest, token: String): MyDealsResponse =
        decodeDelivera(postRaw("/api/deals/app/my-deals", deliveraJson.encodeToString(request), bearer(token)))

    /** Din favorit: aktivera 10%-rabatten (skapar kupongen för kassan). */
    suspend fun claimFavorite(productId: String, token: String): FavoriteClaimResponse =
        decodeDelivera(
            postRaw(
                "/api/deals/app/favorite/claim",
                deliveraJson.encodeToString(mapOf("productId" to productId)),
                bearer(token)
            )
        )

    suspend fun validateLocation(latitude: Double, longitude: Double): ZoneValidationResponse =
        decodeDelivera(
            postRaw(
                "/api/cities/validate-location",
                deliveraJson.encodeToString(ZoneValidationRequest(lat = latitude, lng = longitude))
            )
        )

    suspend fun validateDiscount(code: String, subtotal: Double, token: String?): DiscountValidationResponse {
        val headers = if (!token.isNullOrBlank()) bearer(token) else emptyMap()
        return decodeDelivera(
            postRaw(
                "/api/discount/validate",
                deliveraJson.encodeToString(DiscountValidationRequest(code = code.trim().uppercase(), subtotal = subtotal)),
                headers
            )
        )
    }

    suspend fun redeemReferralCode(code: String, token: String?): ReferralRedeemResponse {
        val headers = if (!token.isNullOrBlank()) bearer(token) else emptyMap()
        return decodeDelivera(
            postRaw(
                "/api/account/redeem-code",
                deliveraJson.encodeToString(ReferralRedeemRequest(code = code.trim().uppercase())),
                headers
            )
        )
    }

    suspend fun referralStatus(token: String): ReferralStatusResponse =
        decodeDelivera(getRaw("/api/account/referral", headers = bearer(token)))

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

    suspend fun dpointsRewards(): DpointsRewardsResponse = decodeDelivera(getRaw("/api/dpoints/rewards"))

    suspend fun dpointsMe(token: String): DpointsMe = decodeDelivera(getRaw("/api/dpoints/me", headers = bearer(token)))

    /** Detaljerad rewards-vy av samma endpoint (Swift dpointsMeDetailed). */
    suspend fun dpointsMeDetailed(token: String): RewardsMe =
        decodeDelivera(getRaw("/api/dpoints/me", headers = bearer(token)))

    suspend fun dpointsRewardProducts(forceRefresh: Boolean = false): DpointsRewardProductsResponse =
        decodeDelivera(
            getRaw(
                "/api/dpoints/reward-products",
                if (forceRefresh) mapOf("refresh" to "1") else emptyMap()
            )
        )

    // Swift dekodar hela RewardsMe ur claim-signup-svaret.
    suspend fun claimSignupBonus(token: String): RewardsMe =
        decodeDelivera(postRaw("/api/dpoints/claim-signup", "{}", bearer(token)))

    suspend fun lookupPhone(phone: String): PhoneLookupResponse =
        decodeDelivera(postRaw("/api/auth/lookup-phone", deliveraJson.encodeToString(mapOf("phone" to phone))))

    suspend fun sendPhoneOtp(phone: String) {
        postSupabaseRaw("/auth/v1/otp", deliveraJson.encodeToString(SupabaseOtpBody(phone = phone)))
    }

    suspend fun verifyPhoneOtp(phone: String, code: String): SupabaseSessionResponse =
        decodeDelivera(
            postSupabaseRaw(
                "/auth/v1/verify",
                deliveraJson.encodeToString(SupabaseVerifyBody(phone = phone, token = code))
            )
        )

    suspend fun exchangePhoneToken(supabaseAccessToken: String): PlatformAuthResponse =
        decodeDelivera(postRaw("/api/auth/phone-token", "{}", bearer(supabaseAccessToken)))

    suspend fun oauthToken(
        provider: String,
        idToken: String,
        email: String?,
        name: String?,
        providerId: String
    ): PlatformAuthResponse =
        decodeDelivera(
            postRaw(
                "/api/auth/oauth-token",
                deliveraJson.encodeToString(
                    OAuthTokenBody(
                        provider = provider,
                        idToken = idToken,
                        email = email,
                        name = name,
                        providerId = providerId
                    )
                )
            )
        )

    suspend fun linkPhone(phone: String, token: String): LinkPhoneResponse =
        decodeDelivera(
            postRaw(
                "/api/profile/link-phone",
                deliveraJson.encodeToString(LinkPhoneRequest(phone = phone)),
                bearer(token)
            )
        )

    suspend fun profile(token: String): CustomerProfile =
        decodeDelivera(getRaw("/api/profile", headers = bearer(token)))

    suspend fun updateProfile(token: String, name: String, email: String): ProfileUpdateResponse =
        decodeDelivera(
            patchRaw(
                "/api/profile",
                deliveraJson.encodeToString(
                    ProfileUpdateBody(
                        name = name.trim(),
                        email = email.trim().ifBlank { null }
                    )
                ),
                bearer(token)
            )
        )

    suspend fun profileDeals(token: String): List<ProfileDeal> =
        decodeDelivera(getRaw("/api/profile/deals", headers = bearer(token)))

    suspend fun profileOrders(token: String): List<ProfileOrder> {
        val raw = getRaw("/api/profile/orders", headers = bearer(token))
        return runCatching { deliveraJson.decodeFromString<ProfileOrdersResponse>(raw).orders }
            .getOrElse { deliveraJson.decodeFromString(raw) }
    }

    suspend fun createOrder(request: CartOrderRequest, idempotencyKey: String, token: String?): CartOrderResponse {
        val headers = mutableMapOf("Idempotency-Key" to idempotencyKey)
        if (!token.isNullOrBlank()) headers["Authorization"] = "Bearer $token"
        return decodeDelivera(postRaw("/api/orders", deliveraJson.encodeToString(request), headers))
    }

    suspend fun createAdyenPayment(orderId: String, returnUrl: String): AdyenPaymentCreateResponse =
        decodeDelivera(
            postRaw(
                "/api/payments/create",
                deliveraJson.encodeToString(
                    AdyenPaymentCreateRequest(orderId = orderId, returnUrl = returnUrl)
                )
            )
        )

    suspend fun verifyAdyenPayment(orderId: String, sessionId: String, sessionResult: String): AdyenVerifyResponse =
        decodeDelivera(
            postRaw(
                "/api/payments/adyen/verify",
                deliveraJson.encodeToString(
                    AdyenVerifyRequest(orderId = orderId, sessionId = sessionId, sessionResult = sessionResult)
                )
            )
        )

    suspend fun customerOrder(id: String, phone: String?, accessToken: String?, authToken: String?): CustomerOrderResponse {
        val query = buildMap {
            if (!phone.isNullOrBlank()) put("phone", phone)
            if (!accessToken.isNullOrBlank()) put("token", accessToken)
            put("_t", now())
        }
        val headers = if (!authToken.isNullOrBlank()) bearer(authToken) else emptyMap()
        return decodeDelivera(getRaw("/api/orders/$id", query, headers))
    }

    /** Fire-and-forget, precis som Swift (try? await). Fel sväljs medvetet. */
    suspend fun abandonOrder(orderId: String, phone: String) {
        runCatching {
            postRaw(
                "/api/orders/$orderId/abandon",
                deliveraJson.encodeToString(AbandonOrderRequest(phone = phone.ifEmpty { null }))
            )
        }
    }

    suspend fun reviewOrder(
        orderId: String,
        rating: Int,
        review: String?,
        phone: String?,
        accessToken: String?,
        authToken: String?
    ): OrderReviewResponse {
        val headers = if (!authToken.isNullOrBlank()) bearer(authToken) else emptyMap()
        return decodeDelivera(
            postRaw(
                "/api/orders/$orderId/review",
                deliveraJson.encodeToString(
                    OrderReviewRequest(
                        rating = rating,
                        review = review?.trim()?.takeIf { it.isNotBlank() },
                        phone = phone?.takeIf { it.isNotBlank() },
                        accessToken = accessToken?.takeIf { it.isNotBlank() }
                    )
                ),
                headers
            )
        )
    }

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
            .header("X-Client-Type", "android")
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
            .header("X-Client-Type", "android")
        headers.forEach { (k, v) -> builder.header(k, v) }
        execute(builder.build())
    }

    suspend fun patchRaw(
        path: String,
        bodyJson: String,
        headers: Map<String, String> = emptyMap()
    ): String = withContext(Dispatchers.IO) {
        val url = (baseUrl.trimEnd('/') + "/" + path.trim('/'))
        val builder = Request.Builder()
            .url(url)
            .patch(bodyJson.toRequestBody(jsonMedia))
            .header("Content-Type", "application/json")
            .header("Cache-Control", "no-cache")
            .header("Pragma", "no-cache")
            .header("X-Client-Type", "android")
        headers.forEach { (k, v) -> builder.header(k, v) }
        execute(builder.build())
    }

    private suspend fun postSupabaseRaw(path: String, bodyJson: String): String = withContext(Dispatchers.IO) {
        val url = (AppConfig.supabaseURL.trimEnd('/') + "/" + path.trim('/'))
        val builder = Request.Builder()
            .url(url)
            .post(bodyJson.toRequestBody(jsonMedia))
            .header("Content-Type", "application/json")
            .header("apikey", AppConfig.supabaseAnonKey)
            .header("Authorization", "Bearer ${AppConfig.supabaseAnonKey}")
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
