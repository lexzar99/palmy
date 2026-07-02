package se.delivera.android.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import se.delivera.android.data.City
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.HomeAppDeal
import se.delivera.android.data.HomeCategorySection
import se.delivera.android.data.HomePulseModule
import se.delivera.android.data.Restaurant
import se.delivera.android.data.Sponsor
import se.delivera.android.data.TrackingAd
import se.delivera.android.data.cuisineTokens
import se.delivera.android.data.sortedForHome
import se.delivera.android.data.uniqued

data class HomeState(
    val restaurants: List<Restaurant> = emptyList(),
    val sponsors: List<Sponsor> = emptyList(),
    val appDeals: List<HomeAppDeal> = emptyList(),
    val pulseModules: List<HomePulseModule> = emptyList(),
    val greeting: String? = null,
    val trackingAds: List<TrackingAd> = emptyList(),
    val sections: List<HomeCategorySection> = emptyList(),
    val cities: List<City> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

/** Port of HomeViewModel.swift, including filter/section logic. */
class HomeViewModel : ViewModel() {
    private val api = DeliveraApi()

    private val _state = MutableStateFlow(HomeState())
    val state = _state.asStateFlow()

    val cuisines: List<String>
        get() {
            val values = _state.value.restaurants.flatMap { cuisineTokens(it.cuisine) }
            return listOf("Alla") + values.toSortedSet().take(8)
        }

    fun load(authToken: String = "") {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            val trimmed = authToken.trim()
            val isLoggedIn = trimmed.isNotEmpty()

            val restaurantReq = async { runCatching { api.restaurants() } }
            val sponsorReq = async { runCatching { api.sponsors() } }
            val dealReq = async { runCatching { api.homeAppDeals(isLoggedIn, trimmed.ifEmpty { null }) } }
            val pulseReq = async { runCatching { api.homePulse(trimmed.ifEmpty { null }) } }
            val adReq = async { runCatching { api.trackingAds() } }
            val sectionReq = async { runCatching { api.homeSections() } }
            val cityReq = async { runCatching { api.cities() } }

            val restaurantRes = restaurantReq.await()
            val sponsorRes = sponsorReq.await()
            val dealRes = dealReq.await()
            val pulseRes = pulseReq.await()
            val adRes = adReq.await()
            val sectionRes = sectionReq.await()
            val cityRes = cityReq.await()

            var s = _state.value
            restaurantRes.getOrNull()?.let { s = s.copy(restaurants = it.sortedForHome()) }
            sponsorRes.getOrNull()?.let { list -> s = s.copy(sponsors = list.filter { it.isActive != false }) }
            dealRes.getOrNull()?.let { s = s.copy(appDeals = it.deals) }
            pulseRes.getOrNull()?.let { s = s.copy(pulseModules = it.modules, greeting = it.greeting) }
            adRes.getOrNull()?.let { list ->
                s = s.copy(trackingAds = list.filter { it.isActive != false }.sortedBy { it.sortOrder ?: 0 })
            }
            sectionRes.getOrNull()?.let { list -> s = s.copy(sections = list.filter { it.isActive }) }
            cityRes.getOrNull()?.let { list -> s = s.copy(cities = list.filter { it.isActive }) }

            s = if (s.restaurants.isEmpty() && restaurantRes.isFailure) {
                s.copy(errorMessage = "Kunde inte hämta data. Kontrollera din anslutning.")
            } else {
                s.copy(errorMessage = null)
            }
            _state.value = s.copy(isLoading = false)
        }
    }

    fun replaceDeal(deal: HomeAppDeal) {
        val deals = _state.value.appDeals.toMutableList()
        val index = deals.indexOfFirst { it.id == deal.id }
        if (index == -1) return
        deals[index] = deal
        _state.value = _state.value.copy(appDeals = deals)
    }

    fun removeDeal(id: String) {
        _state.value = _state.value.copy(appDeals = _state.value.appDeals.filterNot { it.id == id })
    }

    fun filteredRestaurants(cuisine: String, searchQuery: String, cityName: String?): List<Restaurant> =
        filter(_state.value.restaurants, cuisine, searchQuery, cityName)

    fun restaurantsFor(section: HomeCategorySection, cityName: String?): List<Restaurant> {
        var result = _state.value.restaurants

        if (section.manualRestaurantIds.isNotEmpty()) {
            val ids = section.manualRestaurantIds.toSet()
            val manual = result.filter { ids.contains(it.id) }
            result = if (section.filterMode == "MANUAL") manual else manual + result
        }

        section.filters.searchTerm?.lowercase()?.takeIf { it.isNotEmpty() }?.let { term ->
            result = result.filter {
                it.name.lowercase().contains(term) ||
                    (it.cuisine?.lowercase()?.contains(term) ?: false) ||
                    (it.tags ?: emptyList()).any { t -> t.lowercase().contains(term) }
            }
        }

        if (section.filters.cuisines.isNotEmpty()) {
            val cuisines = section.filters.cuisines.map { it.lowercase() }.toSet()
            result = result.filter { cuisines.contains((it.cuisine ?: "").lowercase()) }
        }

        if (section.filters.featuredClasses.isNotEmpty()) {
            val classes = section.filters.featuredClasses.toSet()
            result = result.filter { classes.contains(it.featuredClass ?: 99) }
        }

        section.filters.maxEtaMinutes?.let { maxEta ->
            result = result.filter { (it.etaMinutes ?: 30) <= maxEta }
        }

        if (section.filters.freeDeliveryOnly) result = result.filter { (it.deliveryFee ?: 0.0) <= 0 }
        if (section.filters.openNowOnly) result = result.filter { it.isOpen != false }

        result = filter(result, "Alla", "", cityName)
        return result.uniqued().sortedForHome().take(section.maxRestaurants)
    }

    private fun filter(source: List<Restaurant>, cuisine: String, searchQuery: String, cityName: String?): List<Restaurant> {
        var result = source
        if (!cityName.isNullOrBlank()) {
            result = result.filter { r ->
                val city = r.city ?: return@filter true
                city.contains(cityName, ignoreCase = true) || cityName.contains(city, ignoreCase = true)
            }
        }
        if (cuisine != "Alla") {
            result = result.filter { r ->
                val tokens = cuisineTokens(r.cuisine)
                tokens.any { it.equals(cuisine, ignoreCase = true) } ||
                    (r.tags ?: emptyList()).any { it.contains(cuisine, ignoreCase = true) }
            }
        }
        val query = searchQuery.trim()
        if (query.isNotEmpty()) {
            result = result.filter { r ->
                r.name.contains(query, ignoreCase = true) ||
                    (r.cuisine?.contains(query, ignoreCase = true) ?: false) ||
                    (r.tags ?: emptyList()).any { it.contains(query, ignoreCase = true) }
            }
        }
        return result.sortedForHome()
    }
}
