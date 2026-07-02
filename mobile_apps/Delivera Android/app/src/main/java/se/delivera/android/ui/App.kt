package se.delivera.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import org.json.JSONArray
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.HomeAppDeal
import se.delivera.android.data.OrderMode
import se.delivera.android.data.Prefs
import se.delivera.android.data.Restaurant
import se.delivera.android.data.deliveraJson
import se.delivera.android.ui.address.AddressSheet
import se.delivera.android.ui.cart.CartScreen
import se.delivera.android.ui.cart.CartStore
import se.delivera.android.ui.home.DealCardAction
import se.delivera.android.ui.home.HomeScreen
import se.delivera.android.ui.home.HomeViewModel
import se.delivera.android.ui.order.OrderTrackingScreen
import se.delivera.android.ui.profile.ProfileScreen
import se.delivera.android.ui.restaurant.RestaurantDetailScreen
import se.delivera.android.ui.rewards.RewardsScreen
import se.delivera.android.ui.theme.DeliveraTheme

enum class HomeTab(val title: String, val icon: ImageVector) {
    Home("Hem", Icons.Filled.Home),
    Cart("Varukorg", Icons.Filled.ShoppingBag),
    Rewards("Belöningar", Icons.Filled.CardGiftcard),
    Profile("Profil", Icons.Filled.Person)
}

@Composable
fun DeliveraApp() {
    val homeVm: HomeViewModel = viewModel()
    val homeState by homeVm.state.collectAsState()
    val authToken by Prefs.authTokenState
    val scope = rememberCoroutineScope()
    val api = remember { DeliveraApi() }
    val cartStore = remember { CartStore() }

    var selectedTab by rememberSaveable { mutableStateOf(HomeTab.Home) }
    var selectedRestaurant by remember { mutableStateOf<Restaurant?>(null) }
    var activeOrderId by rememberSaveable { mutableStateOf(Prefs.getString("delivera.pendingOrderId", "")) }
    var activeOrderToken by rememberSaveable { mutableStateOf(Prefs.getString("delivera.pendingOrderToken", "")) }
    var showingAddressSheet by remember { mutableStateOf(false) }

    var orderMode by rememberSaveable { mutableStateOf(OrderMode.Delivery) }
    var selectedCuisine by rememberSaveable { mutableStateOf("Alla") }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var favoritesOnly by rememberSaveable { mutableStateOf(false) }
    var favorites by remember { mutableStateOf(loadFavorites()) }
    var activeUserDealId by remember { mutableStateOf(Prefs.getString(Prefs.KEY_ACTIVE_USER_DEAL_ID, "")) }
    var claimingDealId by remember { mutableStateOf<String?>(null) }
    var deliveryAddress by remember { mutableStateOf(Prefs.getString(Prefs.KEY_DELIVERY_ADDRESS, "Malmö, Sweden")) }
    var deliveryCity by remember { mutableStateOf(Prefs.getString(Prefs.KEY_DELIVERY_CITY, "Malmö")) }
    var pickupCity by remember { mutableStateOf(Prefs.getString(Prefs.KEY_PICKUP_CITY, "Malmö")) }
    var recentAddresses by remember {
        mutableStateOf(loadStringArray(Prefs.KEY_RECENT_DELIVERY_ADDRESSES, listOf("Malmö, Sweden")))
    }

    LaunchedEffect(authToken) { homeVm.load(authToken) }

    fun toggleFavorite(r: Restaurant) {
        favorites = favorites.toMutableSet().apply { if (!add(r.id)) remove(r.id) }
        saveFavorites(favorites)
    }

    fun activateDealInCart(deal: HomeAppDeal) {
        val userDealId = deal.userDealId?.takeIf { it.isNotBlank() } ?: return
        activeUserDealId = userDealId
        Prefs.setString(Prefs.KEY_ACTIVE_USER_DEAL_ID, userDealId)
        Prefs.setString(Prefs.KEY_ACTIVE_USER_DEAL_SNAPSHOT, deliveraJson.encodeToString(deal))
        deal.restaurant?.let { scoped ->
            selectedRestaurant = homeVm.state.value.restaurants.firstOrNull { it.slug == scoped.slug }
                ?: Restaurant(
                    id = scoped.id,
                    name = scoped.name,
                    slug = scoped.slug,
                    cuisine = scoped.cuisine,
                    imageUrl = scoped.imageUrl
                )
        }
    }

    fun handleDealAction(action: DealCardAction) {
        when (action) {
            DealCardAction.LoginRequired -> selectedTab = HomeTab.Profile
            is DealCardAction.Use -> activateDealInCart(action.deal)
            is DealCardAction.Claim -> {
                val token = authToken.trim()
                if (token.isEmpty() || claimingDealId != null) {
                    if (token.isEmpty()) selectedTab = HomeTab.Profile
                    return
                }
                scope.launch {
                    claimingDealId = action.deal.id
                    try {
                        val response = api.claimHomeAppDeal(action.deal.id, token)
                        val claimedDeal = response.deal
                        if (!response.claimed) {
                            if (claimedDeal != null) homeVm.replaceDeal(claimedDeal)
                            return@launch
                        }
                        if (claimedDeal == null) return@launch
                        if (!claimedDeal.missionType.isNullOrBlank()) {
                            homeVm.replaceDeal(claimedDeal)
                            return@launch
                        }
                        homeVm.removeDeal(claimedDeal.id)
                        activateDealInCart(claimedDeal)
                    } finally {
                        claimingDealId = null
                    }
                }
            }
        }
    }

    fun claimSponsorDeal(dealId: String) {
        val token = authToken.trim()
        if (token.isEmpty() || claimingDealId != null) {
            if (token.isEmpty()) selectedTab = HomeTab.Profile
            return
        }
        scope.launch {
            claimingDealId = dealId
            try {
                val response = api.claimHomeAppDeal(dealId, token)
                val claimedDeal = response.deal ?: return@launch
                if (!claimedDeal.missionType.isNullOrBlank()) {
                    homeVm.replaceDeal(claimedDeal)
                } else {
                    activateDealInCart(claimedDeal)
                }
                homeVm.load(token)
            } finally {
                claimingDealId = null
            }
        }
    }

    // Restaurant detail takes over the whole screen (SwiftUI NavigationStack push).
    if (activeOrderId.isNotBlank()) {
        OrderTrackingScreen(
            orderId = activeOrderId,
            phone = Prefs.getString(Prefs.KEY_GUEST_PHONE, ""),
            accessToken = activeOrderToken,
            authToken = authToken,
            onBackHome = {
                activeOrderId = ""
                activeOrderToken = ""
                Prefs.setString("delivera.pendingOrderId", "")
                Prefs.setString("delivera.pendingOrderToken", "")
                selectedTab = HomeTab.Home
            }
        )
        return
    }

    // Restaurant detail takes over the whole screen (SwiftUI NavigationStack push).
    val detail = selectedRestaurant
    if (detail != null) {
        RestaurantDetailScreen(
            restaurant = detail,
            orderMode = orderMode,
            activeAddress = if (orderMode == OrderMode.Delivery) deliveryAddress else pickupCity,
            cartStore = cartStore,
            onBack = { selectedRestaurant = null },
            onOpenCart = { selectedRestaurant = null; selectedTab = HomeTab.Cart }
        )
        return
    }

    Box(Modifier.fillMaxSize()) {
        when (selectedTab) {
            HomeTab.Home -> HomeScreen(
                viewModel = homeVm,
                orderMode = orderMode,
                selectedCuisine = selectedCuisine,
                favoritesOnly = favoritesOnly,
                searchQuery = searchQuery,
                address = if (orderMode == OrderMode.Delivery) deliveryAddress else pickupCity,
                favorites = favorites,
                cityName = if (orderMode == OrderMode.Delivery) deliveryCity else pickupCity,
                isLoggedIn = authToken.isNotBlank(),
                activeUserDealId = activeUserDealId,
                claimingDealId = claimingDealId,
                onSearchChange = { searchQuery = it; favoritesOnly = false },
                onSelectCuisine = { selectedCuisine = it; favoritesOnly = false },
                onAddressTap = { showingAddressSheet = true },
                onFavoritesTap = { if (favorites.isNotEmpty()) favoritesOnly = !favoritesOnly },
                onDealAction = ::handleDealAction,
                onClaimSponsorDeal = ::claimSponsorDeal,
                onOpenRestaurant = { slug ->
                    selectedRestaurant = homeVm.state.value.restaurants.firstOrNull { it.slug == slug }
                        ?: Restaurant.placeholder(slug)
                },
                onToggleFavorite = ::toggleFavorite
            )
            HomeTab.Cart -> CartScreen(
                cartStore = cartStore,
                authToken = authToken,
                isLoggedIn = authToken.isNotBlank(),
                onExploreRestaurants = { selectedTab = HomeTab.Home },
                onOpenProfile = { selectedTab = HomeTab.Profile },
                onOrderCreated = { id, token ->
                    activeOrderId = id
                    activeOrderToken = token.orEmpty()
                }
            )
            HomeTab.Rewards -> RewardsScreen(
                authToken = authToken,
                onOpenProfile = { selectedTab = HomeTab.Profile },
                onClaimedDeal = { deal ->
                    if (deal.missionType.isNullOrBlank()) activateDealInCart(deal)
                    homeVm.replaceDeal(deal)
                }
            )
            HomeTab.Profile -> ProfileScreen(
                authToken = authToken,
                favoriteCount = favorites.size,
                onOpenHome = { selectedTab = HomeTab.Home }
            )
        }

        FloatingBottomNav(
            selectedTab = selectedTab,
            cartCount = cartStore.count,
            onSelect = { selectedTab = it },
            modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 20.dp, vertical = 20.dp)
        )

        if (showingAddressSheet) {
            AddressSheet(
                deliveryAddress = deliveryAddress,
                deliveryCityName = deliveryCity,
                pickupCityName = pickupCity,
                recentAddresses = recentAddresses,
                mode = orderMode,
                cities = homeState.cities,
                onDismiss = { showingAddressSheet = false },
                onConfirm = { nextMode, nextAddress, nextDeliveryCity, latitude, longitude, nextPickupCity, nextRecent ->
                    orderMode = nextMode
                    deliveryAddress = nextAddress
                    deliveryCity = nextDeliveryCity
                    pickupCity = nextPickupCity
                    recentAddresses = nextRecent
                    Prefs.setString(Prefs.KEY_DELIVERY_ADDRESS, nextAddress)
                    Prefs.setString(Prefs.KEY_DELIVERY_CITY, nextDeliveryCity)
                    Prefs.setString(Prefs.KEY_PICKUP_CITY, nextPickupCity)
                    Prefs.setString(Prefs.KEY_RECENT_DELIVERY_ADDRESSES, JSONArray(nextRecent).toString())
                    latitude?.let { Prefs.setDouble(Prefs.KEY_DELIVERY_LAT, it) }
                    longitude?.let { Prefs.setDouble(Prefs.KEY_DELIVERY_LNG, it) }
                }
            )
        }
    }
}

@Composable
fun PlaceholderScreen(title: String, subtitle: String) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, fontSize = 26.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
            Spacer(Modifier.height(8.dp))
            Text(
                subtitle, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                color = DeliveraTheme.muted, textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun FloatingBottomNav(selectedTab: HomeTab, cartCount: Int, onSelect: (HomeTab) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .height(70.dp)
            .shadow(18.dp, RoundedCornerShape(24.dp), ambientColor = Color.Black.copy(alpha = 0.2f), spotColor = Color.Black.copy(alpha = 0.2f))
            .clip(RoundedCornerShape(24.dp))
            .background(Color.White.copy(alpha = 0.96f))
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(24.dp))
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically
    ) {
        HomeTab.entries.forEach { tab ->
            val selected = selectedTab == tab
            Column(
                Modifier
                    .weight(1f)
                    .height(56.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(if (selected) DeliveraTheme.orange.copy(alpha = 0.12f) else Color.Transparent)
                    .clickable { onSelect(tab) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Box(contentAlignment = Alignment.TopEnd) {
                    Icon(tab.icon, null, tint = if (selected) DeliveraTheme.orange else DeliveraTheme.muted, modifier = Modifier.size(21.dp))
                    if (tab == HomeTab.Cart && cartCount > 0) {
                        Box(Modifier.size(15.dp).clip(CircleShape).background(DeliveraTheme.orange), contentAlignment = Alignment.Center) {
                            Text(if (cartCount > 9) "9+" else "$cartCount", fontSize = 8.sp, fontWeight = FontWeight.Black, color = Color.White)
                        }
                    }
                }
                Spacer(Modifier.height(3.dp))
                Text(tab.title, fontSize = 11.sp, fontWeight = FontWeight.Black, color = if (selected) DeliveraTheme.orange else DeliveraTheme.muted, maxLines = 1)
            }
        }
    }
}

private fun loadFavorites(): Set<String> = runCatching {
    loadStringArray(Prefs.KEY_FAVORITES, emptyList()).toSet()
}.getOrDefault(emptySet())

private fun saveFavorites(set: Set<String>) {
    Prefs.setString(Prefs.KEY_FAVORITES, JSONArray(set.toList()).toString())
}

private fun loadStringArray(key: String, fallback: List<String>): List<String> = runCatching {
    val arr = JSONArray(Prefs.getString(key, JSONArray(fallback).toString()))
    (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { value -> value.isNotBlank() } }
}.getOrDefault(fallback)
