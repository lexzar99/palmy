package se.delivera.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.OrderMode
import se.delivera.android.data.Restaurant
import se.delivera.android.data.Sponsor
import se.delivera.android.ui.RemoteImage
import se.delivera.android.ui.components.Entrance
import se.delivera.android.ui.theme.DeliveraTheme

@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    orderMode: OrderMode,
    selectedCuisine: String,
    favoritesOnly: Boolean,
    searchQuery: String,
    address: String,
    favorites: Set<String>,
    cityName: String?,
    isLoggedIn: Boolean,
    activeUserDealId: String,
    claimingDealId: String?,
    onSearchChange: (String) -> Unit,
    onSelectCuisine: (String) -> Unit,
    onAddressTap: () -> Unit,
    onFavoritesTap: () -> Unit,
    onDealAction: (DealCardAction) -> Unit,
    onClaimSponsorDeal: (String) -> Unit,
    onOpenRestaurant: (String) -> Unit,
    onToggleFavorite: (Restaurant) -> Unit
) {
    val state by viewModel.state.collectAsState()
    val filteredRestaurants = viewModel.filteredRestaurants(selectedCuisine, searchQuery, cityName)
    val visibleRestaurants = if (favoritesOnly) filteredRestaurants.filter { favorites.contains(it.id) } else filteredRestaurants
    val carouselItems = homeCarouselItems(state.sponsors, state.appDeals, state.pulseModules)
    val pulseHeroModules = state.pulseModules.filter { it.isHero && it.type != "CHAMPION" }
    val pulseRailModules = state.pulseModules.filter { !it.isHero && it.type != "TRENDING" && it.type != "NEW_RESTAURANTS" }
    val visibleSections = state.sections.take(3)
    val entranceKey = "${state.restaurants.size}-${selectedCuisine}-${searchQuery}-${cityName.orEmpty()}"

    Column(Modifier.fillMaxSize()) {
        // Header on a frosted surface (SwiftUI .ultraThinMaterial).
        Column(
            Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.85f))
                .padding(horizontal = 20.dp).padding(top = 8.dp, bottom = 14.dp)
        ) {
            HomeHeader(
                address = address,
                favoriteCount = favorites.size,
                mode = orderMode,
                searchQuery = searchQuery,
                onSearchChange = onSearchChange,
                onAddressTap = onAddressTap,
                onFavoritesTap = onFavoritesTap
            )
        }

        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 112.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp)
        ) {
            state.errorMessage?.let { item { NoticeBanner(it) } }

            if (!favoritesOnly) {
                item {
                    Entrance(visibleKey = entranceKey, offsetX = (-54).dp, offsetY = 0.dp, scaleFrom = 1f) {
                        HomeCarousel(
                            items = carouselItems,
                            loading = state.isLoading,
                            isLoggedIn = isLoggedIn,
                            activeUserDealId = activeUserDealId,
                            claimingDealId = claimingDealId,
                            onDealAction = onDealAction,
                            onClaimSponsorDeal = onClaimSponsorDeal,
                            onOpenRestaurant = onOpenRestaurant
                        )
                    }
                }

                pulseHeroModules.forEachIndexed { index, module ->
                    item(key = "pulse-hero-${module.id}") {
                        Entrance(visibleKey = entranceKey, delayMillis = 30 + index * 20, offsetX = 54.dp, offsetY = 0.dp, scaleFrom = 1f) {
                            PulseModuleView(
                                module = module,
                                onOpenRestaurant = onOpenRestaurant,
                                onOpenRewards = { onDealAction(DealCardAction.LoginRequired) }
                            )
                        }
                    }
                }

                item {
                    Entrance(visibleKey = entranceKey, delayMillis = 40, offsetX = 54.dp, offsetY = 0.dp, scaleFrom = 1f) {
                        CuisineChips(viewModel.cuisines, selectedCuisine, onSelectCuisine)
                    }
                }

                visibleSections.forEachIndexed { index, section ->
                    val restaurants = viewModel.restaurantsFor(section, cityName)
                    if (restaurants.isNotEmpty()) {
                        item(key = section.id) {
                            Entrance(visibleKey = entranceKey, delayMillis = 70 + index * 20, offsetX = if (index % 2 == 0) 54.dp else (-54).dp, offsetY = 0.dp, scaleFrom = 1f) {
                                RestaurantRail(
                                    title = section.title,
                                    subtitle = section.subtitle ?: "Utvalt nära dig",
                                    restaurants = restaurants,
                                    orderMode = orderMode,
                                    favorites = favorites,
                                    onOpen = { onOpenRestaurant(it.slug) },
                                    onToggleFavorite = onToggleFavorite
                                )
                            }
                        }
                    }
                    if (index < pulseRailModules.size) {
                        item(key = "pulse-rail-${pulseRailModules[index].id}") {
                            Entrance(visibleKey = entranceKey, delayMillis = 80 + index * 20, offsetX = (-54).dp, offsetY = 0.dp, scaleFrom = 1f) {
                                PulseModuleView(
                                    module = pulseRailModules[index],
                                    onOpenRestaurant = onOpenRestaurant,
                                    onOpenRewards = { onDealAction(DealCardAction.LoginRequired) }
                                )
                            }
                        }
                    }
                }

                if (pulseRailModules.size > visibleSections.size) {
                    pulseRailModules.drop(visibleSections.size).forEachIndexed { index, module ->
                        item(key = "pulse-rail-${module.id}") {
                            Entrance(visibleKey = entranceKey, delayMillis = 90 + index * 20, offsetX = (-54).dp, offsetY = 0.dp, scaleFrom = 1f) {
                                PulseModuleView(
                                    module = module,
                                    onOpenRestaurant = onOpenRestaurant,
                                    onOpenRewards = { onDealAction(DealCardAction.LoginRequired) }
                                )
                            }
                        }
                    }
                }
            }

            item {
                Entrance(visibleKey = entranceKey, delayMillis = 110, offsetX = 54.dp, offsetY = 0.dp, scaleFrom = 1f) {
                    SectionHeader(
                        title = if (favoritesOnly) "Favoriter" else if (selectedCuisine == "Alla") "Alla restauranger" else selectedCuisine,
                        subtitle = "${visibleRestaurants.size} restauranger"
                    )
                }
            }
            if (favoritesOnly && visibleRestaurants.isEmpty()) {
                item { NoticeBanner("Spara restauranger med hjärtat.") }
            }
            itemsIndexed(visibleRestaurants, key = { _, restaurant -> "list-${restaurant.id}" }) { index, restaurant ->
                Entrance(visibleKey = entranceKey, delayMillis = 120 + (index.coerceAtMost(8) * 18), offsetX = if (index % 2 == 0) 54.dp else (-54).dp, offsetY = 0.dp, scaleFrom = 1f) {
                    RestaurantCard(
                        restaurant = restaurant,
                        width = null,
                        orderMode = orderMode,
                        isFavorite = favorites.contains(restaurant.id),
                        onOpen = { onOpenRestaurant(it.slug) },
                        onToggleFavorite = onToggleFavorite
                    )
                }
            }
        }
    }
}

@Composable
fun SponsorRail(sponsors: List<Sponsor>, onTap: (Sponsor) -> Unit) {
    if (sponsors.isEmpty()) return
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(sponsors, key = { it.id }) { sponsor ->
            Column(
                Modifier.width(150.dp).clip(RoundedCornerShape(20.dp)).background(Color.White)
                    .then(
                        if (sponsor.isClickable != false)
                            Modifier.clickable { onTap(sponsor) } else Modifier
                    )
            ) {
                RemoteImage(
                    urlString = sponsor.imageUrl,
                    modifier = Modifier.fillMaxWidth().height(150.dp),
                    contentScale = ContentScale.Crop
                )
                if (sponsor.showName != false) {
                    Text(
                        sponsor.name, fontSize = 13.sp, fontWeight = FontWeight.Black,
                        color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
        }
    }
}
