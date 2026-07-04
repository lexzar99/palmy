package se.delivera.android.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

/* ------------------------------------------------------------------ */
/* Restaurant                                                          */
/* ------------------------------------------------------------------ */

@Serializable
data class Restaurant(
    val id: String,
    val name: String,
    val slug: String,
    val cuisine: String? = null,
    val description: String? = null,
    val address: String? = null,
    val city: String? = null,
    val phone: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val selfDelivery: Boolean? = null,
    val legalName: String? = null,
    val organizationNumber: String? = null,
    val imageUrl: String? = null,
    val heroImageUrl: String? = null,
    val rating: Double? = null,
    val ratingCount: Int? = null,
    val deliveryFee: Double? = null,
    val minOrderAmount: Double? = null,
    val vatPercent: Double? = null,
    val etaMinutes: Int? = null,
    val isOpen: Boolean? = null,
    val comingSoon: Boolean? = null,
    val pausedUntil: String? = null,
    val featuredClass: Int? = null,
    val tags: List<String>? = null,
    val dealMaxPercent: Int? = null,
    val dealCoversAll: Boolean? = null,
    // Opening hours have a complex, polymorphic shape server-side. Kept as a raw
    // element so decoding never fails; availability uses isOpen for now.
    val openingHours: JsonElement? = null
) {
    val hasImage: Boolean
        get() = !(heroImageUrl ?: imageUrl ?: "").trim().isEmpty()

    companion object {
        fun placeholder(slug: String) = Restaurant(id = slug, name = "Restaurang", slug = slug)
    }
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

@Serializable
data class MenuResponse(val categories: List<MenuCategory> = emptyList())

@Serializable
data class MenuCategory(
    val id: String,
    val name: String,
    val slug: String? = null,
    val description: String? = null,
    val imageUrl: String? = null,
    val products: List<MenuProduct> = emptyList()
)

@Serializable
data class MenuProduct(
    val id: String,
    val slug: String? = null,
    val name: String,
    val description: String? = null,
    val price: Double,
    val discountActive: Boolean? = null,
    val discountPercent: Double? = null,
    val discountPrice: Double? = null,
    val discountLabel: String? = null,
    val imageUrl: String? = null,
    val isVegan: Boolean? = null,
    val isVegetarian: Boolean? = null,
    val isGlutenFree: Boolean? = null,
    val rewardable: Boolean? = null,
    val rewardPointsMultiplier: Double? = null,
    val rewardPointsPrice: Int? = null,
    val displayMode: String? = null,
    val hideDescription: Boolean? = null,
    val extraGroups: List<MenuExtraGroup>? = null
) {
    val effectivePrice: Double
        get() = if (discountActive == true && discountPrice != null) discountPrice else price

    val requiresConfiguration: Boolean
        get() = !(extraGroups ?: emptyList()).isEmpty()

    val hasImage: Boolean
        get() = imageUrl?.trim()?.isNotEmpty() == true

    fun dpointsUnitCost(valuePerKr: Double, extrasTotal: Double = 0.0): Int {
        rewardPointsPrice?.let { if (it > 0) return it }
        val mult = rewardPointsMultiplier ?: valuePerKr
        val factor = if (mult > 0) mult else valuePerKr
        return ceil(max(0.0, effectivePrice + extrasTotal) * factor).toInt()
    }
}

@Serializable
data class MenuExtraGroup(
    val id: String,
    val name: String,
    val description: String? = null,
    val type: String? = null,
    val required: Boolean? = null,
    val minSelections: Int? = null,
    val maxSelections: Int? = null,
    val displayStyle: String? = null,
    val allowQuantity: Boolean? = null,
    val extras: List<MenuExtra> = emptyList()
)

@Serializable
data class MenuExtra(
    val id: String,
    val name: String,
    val priceAddon: Double? = null,
    val isDefault: Boolean? = null,
    val imageUrl: String? = null
)

@Serializable
data class DpointsMe(
    val enabled: Boolean,
    val balance: Int,
    val valuePerKr: Double,
    val signup: DpointsSignupClaim? = null,
    val streak: DpointsStreak? = null,
    val transactions: List<DpointsTransaction> = emptyList()
)

@Serializable
data class DpointsSignupClaim(
    val claimable: Boolean = false,
    val bonusPoints: Int = 0
)

@Serializable
data class DpointsStreak(
    val count: Int = 0,
    val target: Int = 0
)

@Serializable
data class DpointsTransaction(
    val id: String,
    val amount: Int,
    val type: String? = null,
    val reason: String? = null,
    val balanceAfter: Int? = null,
    val createdAt: String? = null
)

@Serializable
data class DpointsRewardsResponse(
    val enabled: Boolean = false,
    val valuePerKr: Double? = null,
    val rewards: List<DpointsReward> = emptyList(),
    val earnRules: List<DpointsEarnRule> = emptyList(),
    val streakTarget: Int? = null
)

@Serializable
data class DpointsReward(
    val id: String,
    val title: String,
    val description: String? = null,
    val pointsCost: Int,
    val discountType: String? = null,
    val discountValue: Int? = null,
    val minOrderKr: Int? = null,
    val freeDelivery: Boolean? = null,
    val validDays: Int? = null,
    val imageUrl: String? = null
)

@Serializable
data class DpointsEarnRule(
    val key: String,
    val label: String,
    val points: Int,
    val repeat: String? = null
)

@Serializable
data class DpointsSignupClaimResponse(
    val ok: Boolean = false,
    val points: Int = 0,
    val balance: Int = 0
)

@Serializable
data class DiscountValidationRequest(
    val code: String,
    val subtotal: Double
)

@Serializable
data class DiscountValidationResponse(
    val valid: Boolean = false,
    val code: String? = null,
    val description: String? = null,
    val type: String? = null,
    val value: Double? = null,
    val discountAmount: Double = 0.0,
    val minOrder: Double? = null,
    val freeDelivery: Boolean = false
)

@Serializable
data class ReferralRedeemRequest(
    val code: String
)

@Serializable
data class ReferralRedeemResponse(
    val ok: Boolean? = null,
    val inviterName: String? = null,
    val dealsCreated: Int? = null,
    val message: String? = null,
    val userDealId: String? = null,
    val deal: HomeAppDeal? = null
)

@Serializable
data class ReferralStatusResponse(
    val locked: Boolean = true,
    val code: String? = null,
    val shareUrl: String? = null,
    val enabled: Boolean = false,
    val rewardLabel: String? = null,
    val couponsPerSide: Int? = null,
    val deal: ReferralDealInfo? = null,
    val stats: ReferralStats? = null
)

@Serializable
data class ReferralStats(
    val invited: Int = 0,
    val registered: Int = 0,
    val ordered: Int = 0,
    val totalEarnedKr: Double? = null
)

@Serializable
data class ReferralDealInfo(
    val title: String? = null,
    val discountType: String? = null,
    val discountPercent: Double? = null,
    val amountKr: Double? = null,
    val freeDelivery: Boolean? = null,
    val minOrderKr: Double? = null,
    val validUntil: String? = null
)

/* ------------------------------------------------------------------ */
/* Auth / profile / orders                                             */
/* ------------------------------------------------------------------ */

@Serializable
data class SupabaseOtpBody(
    val phone: String,
    val channel: String = "sms",
    @SerialName("should_create_user") val shouldCreateUser: Boolean = true
)

@Serializable
data class SupabaseVerifyBody(
    val phone: String,
    val token: String,
    val type: String = "sms"
)

@Serializable
data class SupabaseSessionResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String? = null
)

@Serializable
data class PlatformAuthResponse(
    val token: String,
    val user: CustomerProfile
)

@Serializable
data class CustomerProfile(
    val id: String? = null,
    val name: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val profileComplete: Boolean? = null,
    val needsPhone: Boolean? = null,
    val needsName: Boolean? = null
) {
    val displayName: String
        get() {
            val joined = listOfNotNull(firstName?.trim(), lastName?.trim())
                .filter { it.isNotBlank() }
                .joinToString(" ")
            return joined.ifBlank { name?.trim().orEmpty() }.ifBlank { "Kund" }
        }
}

@Serializable
data class ProfileOrdersResponse(val orders: List<ProfileOrder> = emptyList())

@Serializable
data class ProfileOrder(
    val id: String,
    val orderNumber: String? = null,
    val status: String = "PENDING",
    val type: String? = null,
    val total: Double = 0.0,
    val deliveryFee: Double? = null,
    val discountAmount: Double? = null,
    val tipAmount: Double? = null,
    val deliveryStreet: String? = null,
    // The endpoint nests the restaurant (Swift ProfileOrderRestaurant); the
    // flat restaurantName is kept as fallback for older payloads.
    val restaurant: ProfileOrderRestaurant? = null,
    @SerialName("restaurantName") private val restaurantNameRaw: String? = null,
    val createdAt: String? = null,
    val rating: Int? = null,
    val reviewedAt: String? = null,
    val items: List<ProfileOrderItem> = emptyList()
) {
    val restaurantName: String?
        get() = restaurant?.name ?: restaurantNameRaw
}

@Serializable
data class ProfileOrderRestaurant(
    val id: String? = null,
    val name: String? = null,
    val slug: String? = null,
    val address: String? = null,
    val zip: String? = null,
    val city: String? = null,
    val phone: String? = null,
    val legalName: String? = null,
    val organizationNumber: String? = null,
    val vatPercent: Int? = null
)

@Serializable
data class ProfileOrderItem(
    val id: String? = null,
    val productName: String? = null,
    val basePrice: Double? = null,
    val quantity: Int = 1,
    val subtotal: Double? = null,
    // Extras can arrive as an array or as a JSON-encoded string, exactly like
    // Swift's decodeFlexibleExtras. Kept raw and parsed lazily.
    @SerialName("selectedExtras") private val selectedExtrasRaw: JsonElement? = null
) {
    val selectedExtras: List<ProfileOrderExtra>
        get() = parseFlexibleExtras(selectedExtrasRaw)
}

@Serializable
data class ProfileOrderExtra(
    val name: String? = null,
    @SerialName("extraName") private val extraNameRaw: String? = null,
    val extraId: String? = null,
    val quantity: Int? = null
) {
    val extraName: String?
        get() = extraNameRaw ?: extraId
}

internal fun parseFlexibleExtras(element: JsonElement?): List<ProfileOrderExtra> {
    if (element == null) return emptyList()
    return runCatching {
        when {
            element is JsonArray ->
                deliveraJson.decodeFromJsonElement<List<ProfileOrderExtra>>(element)
            element is JsonPrimitive && element.isString ->
                deliveraJson.decodeFromString<List<ProfileOrderExtra>>(element.content)
            else -> emptyList()
        }
    }.getOrElse { emptyList() }
}

@Serializable
data class CartOrderRequest(
    val restaurantId: String? = null,
    val restaurantSlug: String? = null,
    val type: String,
    val paymentMethod: String? = "ADYEN",
    val customerName: String,
    val customerPhone: String,
    val customerEmail: String? = null,
    val deliveryStreet: String? = null,
    val deliveryCity: String? = null,
    val deliveryZip: String? = null,
    val deliveryLatitude: Double? = null,
    val deliveryLongitude: Double? = null,
    val deliveryNote: String? = null,
    val note: String? = null,
    val discountCode: String? = null,
    val userDealId: String? = null,
    val items: List<CartOrderItemRequest>,
    val stripePaymentIntentId: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    val pendingPayment: Boolean = true,
    val tip: Double? = null
)

@Serializable
data class CartOrderItemRequest(
    val productId: String,
    val quantity: Int,
    val note: String? = null,
    val selectedExtras: List<CartOrderExtraRequest> = emptyList(),
    val paidWithPoints: Boolean? = null
)

@Serializable
data class CartOrderExtraRequest(
    val groupId: String,
    val groupName: String,
    val extraId: String,
    val extraName: String,
    val priceAddon: Double,
    val quantity: Int = 1
)

@Serializable
data class CartOrderResponse(
    val orderId: String? = null,
    val id: String? = null,
    // isLenient in deliveraJson lets a numeric orderNumber decode as String
    // (Swift uses FlexibleOrderNumber for the same reason).
    val orderNumber: String? = null,
    val estimatedTime: Int? = null,
    val accessToken: String? = null,
    val dpointsEarned: Int? = null,
    val pointsEarned: Int? = null
) {
    val resolvedOrderId: String?
        get() = orderId ?: id
}

@Serializable
data class AdyenPaymentCreateRequest(
    val orderId: String,
    val returnUrl: String,
    val channel: String = "Android",
    val storePaymentMethod: Boolean = false
)

@Serializable
data class AdyenPaymentCreateResponse(
    val provider: String? = null,
    val paymentRef: String? = null,
    val checkoutUrl: String? = null,
    val session: AdyenSession? = null,
    val total: Double? = null,
    val discountAmount: Double? = null
)

@Serializable
data class AdyenSession(
    val id: String,
    val sessionData: String
)

@Serializable
data class CustomerOrderResponse(
    val id: String,
    val orderNumber: String? = null,
    val status: String,
    val type: String? = null,
    val total: Double = 0.0,
    val dpointsEarned: Int? = null,
    val pointsEarned: Int? = null,
    val deliveryFee: Double? = null,
    val discountAmount: Double? = null,
    val paymentStatus: String? = null,
    val paymentMethod: String? = null,
    val rating: Int? = null,
    val reviewedAt: String? = null,
    val estimatedTime: Int? = null,
    val customerPhone: String? = null,
    val deliveryStreet: String? = null,
    val deliveryLatitude: Double? = null,
    val deliveryLongitude: Double? = null,
    val restaurantLat: Double? = null,
    val restaurantLng: Double? = null,
    val restaurantName: String? = null,
    val restaurantPhone: String? = null,
    val restaurantAddress: String? = null,
    val restaurantCity: String? = null,
    val restaurantLegalName: String? = null,
    val restaurantOrgNr: String? = null,
    val restaurantVatPercent: Double? = null,
    val selfDelivery: Boolean? = null,
    val courierAssigned: Boolean? = null,
    val courierLat: Double? = null,
    val courierLng: Double? = null,
    val courierName: String? = null,
    val courierPhone: String? = null,
    val courierVehicle: String? = null,
    val courierLastSeenAt: String? = null,
    val etaEndsAt: String? = null,
    val createdAt: String? = null,
    val preparingAt: String? = null,
    val deliveringAt: String? = null,
    val accessToken: String? = null,
    val items: List<CustomerOrderItemResponse> = emptyList()
)

@Serializable
data class CustomerOrderItemResponse(
    val productName: String,
    val quantity: Int,
    val basePrice: Double? = null,
    val subtotal: Double? = null,
    val selectedExtras: List<CartOrderExtraResponse>? = null
)

@Serializable
data class CartOrderExtraResponse(
    val groupName: String? = null,
    val extraName: String? = null,
    val name: String? = null,
    val quantity: Int? = null,
    val priceAddon: Double? = null
)

@Serializable
data class OrderReviewRequest(
    val rating: Int,
    val review: String? = null,
    val likedItemIds: List<String> = emptyList(),
    val phone: String? = null,
    val accessToken: String? = null
)

@Serializable
data class OrderReviewResponse(
    val success: Boolean = false,
    val dpoints: ReviewDpointsResult? = null
)

@Serializable
data class ReviewDpointsResult(
    val awarded: Boolean? = null,
    val points: Int? = null,
    val balanceAfter: Int? = null,
    val reason: String? = null
)

/* ------------------------------------------------------------------ */
/* Sponsors / ads / deals                                              */
/* ------------------------------------------------------------------ */

@Serializable
data class Sponsor(
    val id: String,
    val name: String,
    val imageUrl: String,
    val videoUrl: String? = null,
    val cardType: String? = null,
    val dealId: String? = null,
    val headline: String? = null,
    val bodyText: String? = null,
    val dealInfo: SponsorDealInfo? = null,
    val isActive: Boolean? = null,
    val isClickable: Boolean? = null,
    val linkType: String? = null,
    val linkTarget: String? = null,
    val ctaText: String? = null,
    val ctaLink: String? = null,
    val showName: Boolean? = null,
    val imageOnly: Boolean? = null,
    val category: String? = null,
    val tier: String? = null,
    val tagline: String? = null,
    val color: String? = null
)

@Serializable
data class SponsorDealInfo(
    val id: String,
    val title: String,
    val valueLabel: String? = null,
    val minOrderKr: Double? = null
)

@Serializable
data class TrackingAd(
    val id: String,
    val brand: String? = null,
    val title: String,
    val subtitle: String? = null,
    val imageUrl: String? = null,
    val url: String? = null,
    val imageOnly: Boolean? = null,
    val isActive: Boolean? = null,
    val sortOrder: Int? = null
)

@Serializable
data class HomeAppDealsResponse(val deals: List<HomeAppDeal> = emptyList())

@Serializable
data class HomeAppDealClaimResponse(
    val claimed: Boolean,
    val deal: HomeAppDeal? = null,
    val userDeal: ClaimedUserDeal? = null
)

@Serializable
data class ClaimedUserDeal(
    val id: String,
    val dealId: String? = null,
    val status: String? = null
)

@Serializable
data class HomeAppDeal(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val badge: String? = null,
    val imageUrl: String? = null,
    val ctaLabel: String? = null,
    val placement: String,
    val audience: String,
    val template: String,
    val size: String,
    val claimRequired: Boolean,
    val dpointsBonus: Int? = null,
    val missionType: String? = null,
    val missionProgress: HomeAppDealMissionProgress? = null,
    val checkoutApplicable: Boolean? = null,
    val discountType: String? = null,
    val discountPercent: Int? = null,
    val amountKr: Int? = null,
    val freeDelivery: Boolean,
    val minOrderKr: Int,
    val restaurant: HomeAppDealRestaurant? = null,
    val userDealId: String? = null,
    val theme: String? = null
)

@Serializable
data class HomeAppDealMissionProgress(
    val target: Int,
    val count: Int,
    val remaining: Int,
    val completed: Boolean,
    val windowDays: Int,
    val rewardPoints: Int,
    val claimed: Boolean
)

@Serializable
data class HomeAppDealRestaurant(
    val id: String,
    val name: String,
    val slug: String,
    val imageUrl: String? = null,
    val cuisine: String? = null
)

/* ------------------------------------------------------------------ */
/* Home pulse                                                          */
/* ------------------------------------------------------------------ */

@Serializable
data class HomePulseResponse(
    val greeting: String? = null,
    val modules: List<HomePulseModule> = emptyList()
)

@Serializable
data class HomePulseModule(
    val type: String,
    val id: String,
    val theme: String? = null,
    val title: String,
    val subtitle: String? = null,
    val restaurant: PulseRestaurant? = null,
    val products: List<PulseProduct>? = null,
    val items: List<PulseProduct>? = null,
    val restaurants: List<PulseRailRestaurant>? = null,
    val product: PulseNudgeProduct? = null,
    val balance: Int? = null,
    val remainingPoints: Int? = null,
    val endsAt: String? = null,
    val progress: PulseStreakProgress? = null,
    val images: List<String>? = null
) {
    val isHero: Boolean
        get() = setOf("CHAMPION", "DAILY_DROP", "COMEBACK", "STREAK", "POINTS_NUDGE", "OCCASION", "WEATHER").contains(type)
}

@Serializable
data class PulseStreakProgress(
    val count: Int,
    val target: Int,
    val rewardPoints: Int
)

@Serializable
data class PulseRestaurant(
    val id: String,
    val name: String,
    val slug: String,
    val cuisine: String? = null,
    val imageUrl: String? = null,
    val heroImageUrl: String? = null,
    val rating: Double? = null
)

@Serializable
data class PulseProduct(
    val productId: String,
    val name: String,
    val priceKr: Double,
    val imageUrl: String? = null,
    val restaurant: PulseRestaurant
)

@Serializable
data class PulseRailRestaurant(
    val id: String,
    val name: String,
    val slug: String,
    val cuisine: String? = null,
    val imageUrl: String? = null,
    val heroImageUrl: String? = null,
    val rating: Double? = null,
    val avgMinutesToday: Int? = null,
    val deliveredToday: Int? = null,
    val growthPct: Int? = null
)

@Serializable
data class PulseNudgeProduct(
    val productId: String,
    val name: String,
    val imageUrl: String? = null,
    val costPoints: Int,
    val restaurant: PulseRestaurant
)

/* ------------------------------------------------------------------ */
/* Platform / city / sections                                          */
/* ------------------------------------------------------------------ */

@Serializable
data class PlatformSettings(
    val companyName: String? = null,
    val organizationNumber: String? = null,
    val companyAddress: String? = null,
    val dpoints: PlatformDpointsSettings? = null
)

@Serializable
data class PlatformDpointsSettings(
    val enabled: Boolean? = null,
    val perKr: Double? = null,
    val valuePerKr: Double? = null
)

@Serializable
data class City(
    val id: String,
    val name: String,
    val slug: String,
    val isActive: Boolean,
    val deliveryMode: String? = null
)

@Serializable
data class Coordinate(val lat: Double, val lng: Double)

@Serializable
data class PlacePrediction(
    val description: String,
    @SerialName("place_id") val placeId: String
)

@Serializable
data class PlacesAutocompleteResponse(val predictions: List<PlacePrediction> = emptyList())

@Serializable
data class PlaceGeocodeResponse(
    val location: Coordinate,
    val postalCode: String? = null,
    val city: String? = null
)

@Serializable
data class ReverseGeocodeResponse(
    val address: String,
    val postalCode: String? = null,
    val city: String? = null
)

@Serializable
data class HomeCategorySection(
    val id: String,
    val title: String,
    val slug: String,
    val subtitle: String? = null,
    val isActive: Boolean,
    val sortOrder: Int,
    val filterMode: String,
    val maxRestaurants: Int,
    val manualRestaurantIds: List<String> = emptyList(),
    val filters: HomeCategoryFilters
)

@Serializable
data class HomeCategoryFilters(
    val searchTerm: String? = null,
    val cuisines: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val featuredClasses: List<Int> = emptyList(),
    val maxEtaMinutes: Int? = null,
    val freeDeliveryOnly: Boolean = false,
    val openNowOnly: Boolean = false
)

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

@Serializable
data class RestaurantReviewsResponse(
    val averageRating: Double,
    val totalCount: Int,
    val reviews: List<RestaurantReview> = emptyList()
)

@Serializable
data class RestaurantReview(
    val id: String,
    val customerName: String,
    val rating: Int? = null,
    val comment: String? = null,
    val reply: String? = null,
    val likedItems: List<String>? = null,
    val createdAt: String? = null
)

/* ------------------------------------------------------------------ */
/* Deals checkout (quote / my-deals / favorite claim)                  */
/* ------------------------------------------------------------------ */

// Alla mina deals quotade mot varukorgen på en gång (kassans väljbara lista).
@Serializable
data class MyDealsRequest(
    val subtotalKr: Double,
    val deliveryFeeKr: Double,
    val orderMode: String,
    val restaurantId: String? = null
)

@Serializable
data class MyDealsResponse(val deals: List<MyDealItem> = emptyList())

@Serializable
data class MyDealItem(
    val userDealId: String,
    val title: String,
    val valueLabel: String? = null,
    val favoritePercent: Int? = null,
    val applicable: Boolean = false,
    val reason: String? = null,
    val minOrderKr: Int? = null,
    val discountAmountKr: Double = 0.0,
    val deliveryDiscountKr: Double? = null,
    val dpointsBonus: Int = 0,
    val freeDelivery: Boolean? = null
) {
    val id: String get() = userDealId
}

@Serializable
data class AppDealQuoteRequest(
    val userDealId: String,
    val subtotalKr: Double,
    val deliveryFeeKr: Double,
    val orderMode: String,
    val restaurantId: String? = null
)

@Serializable
data class AppDealQuoteResponse(
    val applicable: Boolean = false,
    val reason: String? = null,
    val minOrderKr: Int? = null,
    val discountAmountKr: Double = 0.0,
    val deliveryDiscountKr: Double = 0.0,
    val subtotalDiscountKr: Double = 0.0,
    val dpointsBonus: Int = 0,
    val deal: HomeAppDeal? = null
)

// Din favorit: aktivera 10%-rabatten (skapar kupongen för kassan).
@Serializable
data class FavoriteClaimResponse(
    val claimed: Boolean = false,
    val userDealId: String = "",
    val amountKr: Int = 0,
    val title: String = ""
)

/* ------------------------------------------------------------------ */
/* Payments (Adyen verify) / order abandon                             */
/* ------------------------------------------------------------------ */

@Serializable
data class AdyenVerifyRequest(
    val orderId: String,
    val sessionId: String,
    val sessionResult: String
)

@Serializable
data class AdyenVerifyResponse(
    val paid: Boolean? = null,
    val pending: Boolean? = null,
    val failed: Boolean? = null,
    val status: String? = null
)

@Serializable
data class AbandonOrderRequest(val phone: String? = null)

/* ------------------------------------------------------------------ */
/* Auth (lookup / oauth / link-phone) + profile update                 */
/* ------------------------------------------------------------------ */

@Serializable
data class PhoneLookupResponse(
    val exists: Boolean = false,
    val hasFullAccount: Boolean = false,
    val isVerified: Boolean = false
)

@Serializable
data class OAuthTokenBody(
    val provider: String,
    val idToken: String,
    val email: String? = null,
    val name: String? = null,
    val providerId: String
)

@Serializable
data class LinkPhoneRequest(val phone: String)

@Serializable
data class LinkPhoneResponse(val user: CustomerProfile)

@Serializable
data class ProfileUpdateBody(
    val name: String,
    val email: String? = null
)

@Serializable
data class ProfileUpdateResponse(val success: Boolean? = null)

/**
 * Returnerar E.164 (+46...) eller null om numret inte är ett rimligt svenskt
 * mobilnummer. Svenska mobilnummer är 9 siffror efter landskoden (7XXXXXXXX).
 * Exakt samma regler som Swift-appens normalizeSwedishPhone.
 */
fun normalizeSwedishPhone(raw: String): String? {
    val digits = raw.filter { it.isDigit() }
    val national = when {
        digits.startsWith("46") -> digits.drop(2)
        digits.startsWith("0") -> digits.drop(1)
        else -> digits
    }
    if (national.length != 9 || !national.startsWith("7")) return null
    return "+46$national"
}

/* ------------------------------------------------------------------ */
/* Profile deals (personliga deals-panelen)                            */
/* ------------------------------------------------------------------ */

@Serializable
data class ProfileDeal(
    val id: String,
    val code: String? = null,
    val userDealId: String? = null,
    val source: String? = null,
    val amountKr: Double? = null,
    val discountPercent: Double? = null,
    val freeDelivery: Boolean? = null,
    val minOrderKr: Double? = null,
    val dpointsBonus: Int? = null,
    val campaign: ProfileDealCampaign? = null
) {
    val title: String
        get() = campaign?.title ?: campaign?.name ?: "Personlig deal"

    val subtitle: String
        get() {
            if (!code.isNullOrEmpty()) return "Kod: $code"
            campaign?.let { return it.displayDiscount }
            return "Redo att användas i kassan"
        }
}

@Serializable
data class ProfileDealCampaign(
    val id: String? = null,
    val title: String? = null,
    val name: String? = null,
    val description: String? = null,
    val discountType: String? = null,
    val discountValue: Double? = null,
    val minOrder: Double? = null,
    val freeDelivery: Boolean? = null,
    val appDpointsBonus: Int? = null
) {
    val displayDiscount: String
        get() {
            if (freeDelivery == true || discountType == "FREE_DELIVERY") return "Fri leverans"
            val value = discountValue ?: 0.0
            if (discountType == "PERCENTAGE") return "${value.roundToInt()}% rabatt"
            return "${value.roundToInt()} kr rabatt"
        }
}

/* ------------------------------------------------------------------ */
/* Rewards (detaljerad dpoints/me + reward-products)                   */
/* ------------------------------------------------------------------ */

@Serializable
data class RewardsMe(
    val enabled: Boolean = false,
    val balance: Int = 0,
    val valuePerKr: Double = 0.1,
    val signup: SignupBonus? = null,
    val streak: Streak? = null,
    val transactions: List<DpointsTransaction> = emptyList()
) {
    @Serializable
    data class SignupBonus(
        val claimable: Boolean = false,
        val bonusPoints: Int = 0,
        val sponsorName: String? = null
    )

    @Serializable
    data class Streak(
        val target: Int = 0,
        val count: Int = 0,
        val ready: Boolean = false,
        val readyInDays: Int = 0
    )
}

@Serializable
data class DpointsRewardProductsResponse(
    val enabled: Boolean? = null,
    val earnRate: Double? = null,
    val restaurants: List<RewardRestaurant> = emptyList()
)

@Serializable
data class RewardRestaurant(
    val id: String,
    val name: String,
    val slug: String,
    val cuisine: String? = null,
    val imageUrl: String? = null,
    val logoUrl: String? = null,
    val products: List<RewardProduct> = emptyList()
)

@Serializable
data class RewardProduct(
    val id: String,
    val name: String,
    val description: String? = null,
    val price: Double = 0.0,
    val imageUrl: String? = null,
    val categoryId: String? = null,
    val categoryName: String? = null,
    val pointsPrice: Int = 0,
    val multiplier: Double? = null,
    val tier: RewardTier? = null
) {
    val hasImage: Boolean
        get() = imageUrl?.trim()?.isNotEmpty() == true
}

@Serializable
data class RewardTier(
    val key: String,
    val label: String,
    val rank: Int = 0
)

/* ------------------------------------------------------------------ */
/* Order mode                                                          */
/* ------------------------------------------------------------------ */

enum class OrderMode(val apiValue: String) {
    Delivery("delivery"),
    Pickup("pickup")
}
