package se.delivera.android.data

/** Array+Uniqued.swift */
fun List<Restaurant>.sortedForHome(): List<Restaurant> =
    sortedWith(compareBy<Restaurant> { it.featuredClass ?: 99 }.thenByDescending { it.rating ?: 0.0 })

fun List<Restaurant>.uniqued(): List<Restaurant> {
    val seen = HashSet<String>()
    return filter { seen.add(it.id) }
}

/** RestaurantAvailability.swift (isOpen/comingSoon/pausedUntil subset). */
object RestaurantAvailability {
    fun statusLabel(restaurant: Restaurant): String? {
        if (restaurant.comingSoon == true) return "Kommer snart"
        if (restaurant.isOpen == false) return "Stängt"
        return null
    }

    fun isDimmed(restaurant: Restaurant): Boolean =
        restaurant.comingSoon == true || restaurant.isOpen == false

    fun isAccessible(restaurant: Restaurant): Boolean = restaurant.comingSoon != true

    fun isOrderingEnabled(restaurant: Restaurant): Boolean =
        restaurant.comingSoon != true && restaurant.isOpen != false
}

/** HomeViewModel.cuisineTokens */
fun cuisineTokens(value: String?): List<String> {
    if (value == null) return emptyList()
    val normalized = value
        .replace(" och ", ",", ignoreCase = true)
        .replace("/", ",")
        .replace("&", ",")
    return normalized.split(",")
        .map { token -> token.trim().replaceFirstChar { it.uppercase() } }
        .filter { it.isNotEmpty() }
}
