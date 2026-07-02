package se.delivera.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import se.delivera.android.data.HomeAppDeal
import se.delivera.android.data.HomePulseModule
import se.delivera.android.data.PulseProduct
import se.delivera.android.data.PulseRailRestaurant
import se.delivera.android.data.Sponsor
import se.delivera.android.ui.RemoteImage
import se.delivera.android.ui.theme.DeliveraTheme

sealed class HomeCarouselItem(val stableId: String) {
    data class SponsorItem(val sponsor: Sponsor) : HomeCarouselItem("sponsor:${sponsor.id}")
    data class DealItem(val deal: HomeAppDeal) : HomeCarouselItem("deal:${deal.id}")
    data class ChampionItem(val module: HomePulseModule) : HomeCarouselItem("champion:${module.id}")
    data class HighlightItem(val restaurant: PulseRailRestaurant, val badge: String) : HomeCarouselItem("highlight:$badge:${restaurant.id}")
}

fun homeCarouselItems(
    sponsors: List<Sponsor>,
    deals: List<HomeAppDeal>,
    modules: List<HomePulseModule>
): List<HomeCarouselItem> {
    val extras = mutableListOf<HomeCarouselItem>()
    modules.firstOrNull { it.type == "CHAMPION" }?.let { extras += HomeCarouselItem.ChampionItem(it) }
    extras += deals.map { HomeCarouselItem.DealItem(it) }
    modules.firstOrNull { it.type == "TRENDING" }?.restaurants.orEmpty().take(2).forEach {
        extras += HomeCarouselItem.HighlightItem(it, "Trendar")
    }
    modules.firstOrNull { it.type == "NEW_RESTAURANTS" }?.restaurants.orEmpty().take(2).forEach {
        extras += HomeCarouselItem.HighlightItem(it, "Ny i stan")
    }

    val mixed = mutableListOf<HomeCarouselItem>()
    var extraIndex = 0
    sponsors.forEach { sponsor ->
        mixed += HomeCarouselItem.SponsorItem(sponsor)
        if (extraIndex < extras.size) mixed += extras[extraIndex++]
    }
    if (extraIndex < extras.size) mixed += extras.drop(extraIndex)
    return mixed
}

@Composable
fun HomeCarousel(
    items: List<HomeCarouselItem>,
    loading: Boolean,
    activeUserDealId: String,
    claimingDealId: String?,
    isLoggedIn: Boolean,
    onDealAction: (DealCardAction) -> Unit,
    onClaimSponsorDeal: (String) -> Unit,
    onOpenRestaurant: (String) -> Unit
) {
    if (!loading && items.isEmpty()) return

    var activeIndex by remember(items.map { it.stableId }) { mutableIntStateOf(0) }
    var isPlaying by remember { androidx.compose.runtime.mutableStateOf(true) }
    val safeActiveIndex = activeIndex.coerceIn(0, (items.size - 1).coerceAtLeast(0))
    val listState = rememberLazyListState()

    LaunchedEffect(items.map { it.stableId }, isPlaying) {
        activeIndex = safeActiveIndex
        while (isPlaying && items.size > 1) {
            delay(4500)
            activeIndex = (activeIndex + 1) % items.size
        }
    }

    LaunchedEffect(safeActiveIndex, items.map { it.stableId }) {
        if (items.isNotEmpty()) listState.animateScrollToItem(safeActiveIndex)
    }

    LaunchedEffect(listState, items.map { it.stableId }) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index ->
                if (index in items.indices) activeIndex = index
            }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader(title = "Aktuellt", subtitle = "Nytt och utvalt just nu")

        if (loading && items.isEmpty()) {
            Box(
                Modifier.fillMaxWidth().height(180.dp).clip(RoundedCornerShape(14.dp))
                    .background(Color.White.copy(alpha = 0.9f))
                    .border(1.dp, DeliveraTheme.line, RoundedCornerShape(14.dp))
            )
        } else {
            BoxWithConstraints {
                val cardWidth = maxWidth
                LazyRow(
                    state = listState,
                    horizontalArrangement = Arrangement.spacedBy(0.dp),
                    contentPadding = PaddingValues(end = 0.dp)
                ) {
                    items(items, key = { it.stableId }) { item ->
                        Box(Modifier.width(cardWidth).height(184.dp).padding(end = 0.dp)) {
                            when (item) {
                                is HomeCarouselItem.SponsorItem -> SponsorHeroCard(
                                    sponsor = item.sponsor,
                                    onClaimDeal = onClaimSponsorDeal
                                )
                                is HomeCarouselItem.DealItem -> DealCard(
                                    deal = item.deal,
                                    isLoggedIn = isLoggedIn,
                                    isActive = item.deal.userDealId?.takeIf { it.isNotBlank() } == activeUserDealId,
                                    isClaiming = claimingDealId == item.deal.id,
                                    fullWidth = true,
                                    height = 184,
                                    onAction = onDealAction
                                )
                                is HomeCarouselItem.ChampionItem -> ChampionCarouselCard(item.module, onOpenRestaurant)
                                is HomeCarouselItem.HighlightItem -> RestaurantHighlightCard(item.restaurant, item.badge, onOpenRestaurant)
                            }
                        }
                    }
                }
            }
        }

        if (!loading && items.size > 1) {
            Box(Modifier.fillMaxWidth().height(40.dp)) {
                Row(
                    Modifier.align(Alignment.Center),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    items.indices.forEach { index ->
                        Box(
                            Modifier
                                .width(if (index == safeActiveIndex) 22.dp else 8.dp)
                                .height(8.dp)
                                .clip(RoundedCornerShape(50))
                                .background(if (index == safeActiveIndex) DeliveraTheme.ink else DeliveraTheme.ink.copy(alpha = 0.16f))
                                .clickable {
                                    activeIndex = index
                                    isPlaying = false
                                }
                        )
                    }
                }
                Box(
                    Modifier.align(Alignment.CenterEnd).size(40.dp).clip(CircleShape)
                        .background(Color(0.96f, 0.94f, 0.91f)).clickable { isPlaying = !isPlaying },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, null, tint = DeliveraTheme.ink.copy(alpha = 0.7f), modifier = Modifier.size(17.dp))
                }
            }
        }
    }
}

@Composable
private fun SponsorHeroCard(sponsor: Sponsor, onClaimDeal: (String) -> Unit) {
    val cardType = (sponsor.cardType ?: "RESTAURANT").uppercase()
    val showText = sponsor.imageOnly != true
    val mainPartner = sponsor.tier?.contains("huvud", ignoreCase = true) == true
    val category = listOfNotNull(sponsor.category, sponsor.tier).firstOrNull { it.isNotBlank() } ?: "Aktuellt"

    Box(
        Modifier.fillMaxSize().clip(RoundedCornerShape(14.dp)).background(Color(0.95f, 0.95f, 0.94f))
    ) {
        if (cardType == "TEXT" && sponsor.imageUrl.isBlank()) {
            Box(Modifier.fillMaxSize().background(DealCardGradient(sponsor.color ?: "midnight")))
        } else {
            RemoteImage(sponsor.imageUrl, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        }

        if (showText) {
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        listOf(Color.Black.copy(alpha = 0.02f), Color.Black.copy(alpha = 0.08f), Color.Black.copy(alpha = 0.62f))
                    )
                )
            )
            Column(
                Modifier.align(Alignment.BottomStart).padding(start = 22.dp, end = 18.dp, bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                Text(category.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Black, color = Color.White.copy(alpha = 0.9f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    sponsor.headline?.takeIf { it.isNotBlank() } ?: sponsor.name,
                    fontSize = 22.sp,
                    lineHeight = 24.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                val supporting = sponsor.bodyText?.takeIf { it.isNotBlank() } ?: sponsor.tagline?.takeIf { it.isNotBlank() }
                supporting?.let {
                    Text(it, fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.9f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }

        if (cardType == "DEAL") {
            Column(
                Modifier.fillMaxSize().padding(14.dp),
                horizontalAlignment = Alignment.End
            ) {
                sponsor.dealInfo?.valueLabel?.takeIf { it.isNotBlank() }?.let {
                    Text(it, fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, modifier = Modifier.height(30.dp).clip(RoundedCornerShape(50)).background(Color.White).padding(horizontal = 10.dp, vertical = 6.dp))
                }
                Spacer(Modifier.weight(1f))
                sponsor.dealInfo?.id?.let { dealId ->
                    Text(
                        "Hämta",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        modifier = Modifier.height(38.dp).clip(RoundedCornerShape(50)).background(DeliveraTheme.orange).clickable { onClaimDeal(dealId) }.padding(horizontal = 18.dp, vertical = 9.dp)
                    )
                }
            }
        }

        if (cardType == "AD") {
            Text(
                "ANNONS",
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
                color = Color.White.copy(alpha = 0.92f),
                modifier = Modifier.align(Alignment.TopEnd).padding(10.dp).height(20.dp).clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 7.dp, vertical = 4.dp)
            )
        }

        if (mainPartner && showText) {
            Row(
                Modifier.align(Alignment.TopStart).padding(10.dp).height(22.dp).clip(RoundedCornerShape(50)).background(DeliveraTheme.gold).padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.Star, null, tint = Color(0.47f, 0.30f, 0.03f), modifier = Modifier.size(10.dp))
                Text("HUVUDPARTNER", fontSize = 9.sp, fontWeight = FontWeight.Black, color = Color(0.47f, 0.30f, 0.03f))
            }
        }
    }
}

@Composable
private fun ChampionCarouselCard(module: HomePulseModule, onOpenRestaurant: (String) -> Unit) {
    val restaurant = module.restaurant ?: return
    Box(
        Modifier.fillMaxSize().clip(RoundedCornerShape(14.dp)).clickable { onOpenRestaurant(restaurant.slug) }
    ) {
        RemoteImage(restaurant.heroImageUrl ?: restaurant.imageUrl, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.68f)))))
        Column(Modifier.align(Alignment.BottomStart).padding(15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Badge("Veckans favorit")
            Text(restaurant.name, fontSize = 24.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(module.subtitle ?: restaurant.cuisine.orEmpty(), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.88f), maxLines = 1)
        }
    }
}

@Composable
private fun RestaurantHighlightCard(restaurant: PulseRailRestaurant, badge: String, onOpenRestaurant: (String) -> Unit) {
    Box(
        Modifier.fillMaxSize().clip(RoundedCornerShape(14.dp)).clickable { onOpenRestaurant(restaurant.slug) }
    ) {
        val image = restaurant.heroImageUrl ?: restaurant.imageUrl
        if (image != null) RemoteImage(image, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop) else Box(Modifier.fillMaxSize().background(DealCardGradient("midnight")))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.68f)))))
        Column(Modifier.align(Alignment.BottomStart).padding(15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Badge(badge)
            Text(restaurant.name, fontSize = 23.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            restaurant.cuisine?.takeIf { it.isNotBlank() }?.let {
                Text(it.replaceFirstChar { c -> c.uppercase() }, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.88f), maxLines = 1)
            }
        }
    }
}

@Composable
fun PulseModuleView(module: HomePulseModule, onOpenRestaurant: (String) -> Unit, onOpenRewards: () -> Unit) {
    when (module.type) {
        "HOT_PRODUCTS" -> PulseProductRail(module.title, module.subtitle, module.products.orEmpty(), onOpenRestaurant)
        "NEW_MENU_ITEMS" -> PulseProductRail(module.title, module.subtitle, module.items.orEmpty(), onOpenRestaurant)
        "FASTEST_TODAY" -> PulseRestaurantRail(module.title, module.subtitle, module.restaurants.orEmpty(), "Snabb", onOpenRestaurant)
        "TRENDING" -> PulseRestaurantRail(module.title, module.subtitle, module.restaurants.orEmpty(), "Trendar", onOpenRestaurant)
        "NEW_RESTAURANTS" -> PulseRestaurantRail(module.title, module.subtitle, module.restaurants.orEmpty(), "Ny", onOpenRestaurant)
        "STREAK" -> GenericPulseCard(module, Icons.Filled.LocalFireDepartment, onOpenRewards)
        "POINTS_NUDGE" -> GenericPulseCard(module, Icons.Filled.Campaign) {
            module.product?.restaurant?.slug?.let(onOpenRestaurant)
        }
        "DAILY_DROP" -> GenericPulseCard(module, Icons.Filled.LocalFireDepartment) {
            module.product?.restaurant?.slug?.let(onOpenRestaurant)
        }
        "COMEBACK" -> GenericPulseCard(module, Icons.Filled.Storefront) {
            module.restaurant?.slug?.let(onOpenRestaurant)
        }
        "OCCASION", "WEATHER" -> GenericPulseCard(module, Icons.Filled.Campaign) {}
    }
}

@Composable
private fun PulseProductRail(title: String, subtitle: String?, products: List<PulseProduct>, onOpenRestaurant: (String) -> Unit) {
    if (products.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader(title, subtitle ?: "Utvalt just nu")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(products, key = { it.productId }) { product ->
                Column(
                    Modifier.width(154.dp).clip(RoundedCornerShape(16.dp)).background(Color.White)
                        .border(1.dp, DeliveraTheme.line, RoundedCornerShape(16.dp))
                        .clickable { onOpenRestaurant(product.restaurant.slug) }
                ) {
                    RemoteImage(product.imageUrl, modifier = Modifier.fillMaxWidth().height(112.dp), contentScale = ContentScale.Crop)
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(product.name, fontSize = 14.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(product.restaurant.name, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${product.priceKr.toInt()} kr", fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
                    }
                }
            }
        }
    }
}

@Composable
private fun PulseRestaurantRail(title: String, subtitle: String?, restaurants: List<PulseRailRestaurant>, badge: String, onOpenRestaurant: (String) -> Unit) {
    if (restaurants.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader(title, subtitle ?: "Servern uppdaterar listan automatiskt")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(restaurants, key = { it.id }) { restaurant ->
                Box(
                    Modifier.width(220.dp).height(142.dp).clip(RoundedCornerShape(16.dp)).clickable { onOpenRestaurant(restaurant.slug) }
                ) {
                    RemoteImage(restaurant.heroImageUrl ?: restaurant.imageUrl, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.65f)))))
                    Column(Modifier.align(Alignment.BottomStart).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Badge(badge)
                        Text(restaurant.name, fontSize = 17.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
private fun GenericPulseCard(module: HomePulseModule, icon: androidx.compose.ui.graphics.vector.ImageVector, onTap: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(DealCardGradient(module.theme ?: "sky"))
            .clickable { onTap() }.padding(16.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(module.title, fontSize = 18.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                module.subtitle?.let { Text(it, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.85f), maxLines = 2) }
            }
        }
    }
}

@Composable
private fun Badge(text: String) {
    Text(
        text.uppercase(),
        fontSize = 10.sp,
        fontWeight = FontWeight.Black,
        color = Color.White,
        modifier = Modifier.height(23.dp).clip(RoundedCornerShape(50)).background(DeliveraTheme.orange).padding(horizontal = 9.dp, vertical = 5.dp)
    )
}

private fun DealCardGradient(theme: String): Brush {
    val colors = when (theme) {
        "ember" -> listOf(Color(0.94f, 0.38f, 0.12f), Color(0.72f, 0.16f, 0.10f))
        "forest" -> listOf(Color(0.13f, 0.58f, 0.36f), Color(0.05f, 0.36f, 0.24f))
        "midnight" -> listOf(Color(0.16f, 0.18f, 0.30f), Color(0.05f, 0.06f, 0.14f))
        "gold" -> listOf(Color(0.87f, 0.63f, 0.16f), Color(0.62f, 0.40f, 0.05f))
        else -> listOf(DeliveraTheme.dealBlue, DeliveraTheme.dealBlueDeep)
    }
    return Brush.linearGradient(colors)
}
