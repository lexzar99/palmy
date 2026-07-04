package se.delivera.android.data

import kotlinx.serialization.Serializable

/* Port of Models/ZoneValidation.swift. */

@Serializable
data class ZoneValidationRequest(
    val lat: Double,
    val lng: Double
)

@Serializable
data class ZoneValidationResponse(
    val covered: Boolean,
    val cities: List<ZoneCity> = emptyList()
)

@Serializable
data class ZoneCity(
    val id: String? = null,
    val name: String? = null,
    val restaurants: List<ZoneRestaurant> = emptyList()
)

@Serializable
data class ZoneRestaurant(
    val id: String,
    val name: String,
    val slug: String,
    val isOpen: Boolean? = null,
    val deliveryFee: Double? = null,
    val minOrderAmount: Double? = null,
    val etaMinutes: Int? = null,
    val matchedZone: MatchedZone? = null
)

@Serializable
data class MatchedZone(
    val deliveryFee: Double? = null,
    val minOrder: Double? = null,
    val etaMinutes: Int? = null
) {
    // Zon-fälten kommer i öre (undantaget), precis som i Swift-modellen.
    val feeKr: Double?
        get() = deliveryFee?.let { it / 100 }

    val minOrderKr: Double?
        get() = minOrder?.let { it / 100 }
}
