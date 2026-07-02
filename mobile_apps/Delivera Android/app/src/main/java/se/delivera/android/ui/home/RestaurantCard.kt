package se.delivera.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.OrderMode
import se.delivera.android.data.Restaurant
import se.delivera.android.data.RestaurantAvailability
import se.delivera.android.ui.RemoteImage
import se.delivera.android.ui.theme.DeliveraTheme

fun Modifier.cardShadow(shape: androidx.compose.ui.graphics.Shape) =
    this.shadow(elevation = 10.dp, shape = shape, spotColor = Color.Black.copy(alpha = 0.5f), ambientColor = Color.Black.copy(alpha = 0.5f))

@Composable
fun RestaurantRail(
    title: String,
    subtitle: String,
    restaurants: List<Restaurant>,
    orderMode: OrderMode,
    favorites: Set<String>,
    onOpen: (Restaurant) -> Unit,
    onToggleFavorite: (Restaurant) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader(title = title, subtitle = subtitle)
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(end = 20.dp)
        ) {
            items(restaurants, key = { it.id }) { restaurant ->
                RestaurantCard(
                    restaurant = restaurant,
                    width = 260.dp,
                    orderMode = orderMode,
                    isFavorite = favorites.contains(restaurant.id),
                    onOpen = onOpen,
                    onToggleFavorite = onToggleFavorite
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RestaurantCard(
    restaurant: Restaurant,
    width: Dp?,
    orderMode: OrderMode,
    isFavorite: Boolean,
    onOpen: (Restaurant) -> Unit,
    onToggleFavorite: (Restaurant) -> Unit
) {
    val dimmed = RestaurantAvailability.isDimmed(restaurant)
    val imageHeight = if (width == null) 178.dp else 142.dp

    Column(
        Modifier
            .then(if (width != null) Modifier.width(width) else Modifier.fillMaxWidth())
            .cardShadow(RoundedCornerShape(20.dp))
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(20.dp))
            .alpha(if (dimmed) 0.68f else 1f)
            .clickable(enabled = RestaurantAvailability.isAccessible(restaurant)) { onOpen(restaurant) }
    ) {
        Box(Modifier.fillMaxWidth().height(imageHeight)) {
            if (restaurant.hasImage) {
                RemoteImage(
                    urlString = restaurant.heroImageUrl ?: restaurant.imageUrl,
                    modifier = Modifier.fillMaxWidth().height(imageHeight).clip(RoundedCornerShape(18.dp)),
                    contentScale = ContentScale.Crop,
                    showsFailureIcon = false
                )
            } else {
                Box(Modifier.fillMaxWidth().height(imageHeight).clip(RoundedCornerShape(18.dp)).background(Color.White))
            }

            // Badges (top-leading)
            Box(Modifier.padding(12.dp).align(Alignment.TopStart)) {
                DealBadges(restaurant, orderMode)
            }

            // Favorite (top-trailing)
            Box(
                Modifier.padding(12.dp).align(Alignment.TopEnd).size(34.dp)
                    .clip(CircleShape).background(Color.White.copy(alpha = 0.94f))
                    .clickable { onToggleFavorite(restaurant) },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    null, tint = DeliveraTheme.orange, modifier = Modifier.size(14.dp)
                )
            }
        }

        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(restaurant.name, fontSize = 16.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        restaurant.cuisine?.replaceFirstChar { it.uppercase() } ?: restaurant.description ?: "Restaurang",
                        fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold, color = DeliveraTheme.muted, maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(Modifier.width(10.dp))
                RatingBadge(value = restaurant.rating ?: 4.7)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Metric(metricSchedule, "${displayEta(restaurant)} min", Modifier.weight(0.75f))
                Metric(orderMode.icon(), feeText(restaurant, orderMode), Modifier.weight(0.8f))
                restaurant.city?.takeIf { it.isNotEmpty() }?.let { Metric(metricPlace, it, Modifier.weight(1f)) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DealBadges(restaurant: Restaurant, orderMode: OrderMode) {
    val status = RestaurantAvailability.statusLabel(restaurant)
    if (status != null) {
        BadgePill(status, if (restaurant.comingSoon == true) Icons.Filled.AutoAwesome else Icons.Filled.Bedtime, Color.Black.copy(alpha = 0.78f))
    } else {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            val featuredClass = restaurant.featuredClass
            if (featuredClass != null && featuredClass <= 1) {
                BadgePill("Utvald", Icons.Filled.Star, Color(0.72f, 0.50f, 0.08f))
            } else if (featuredClass == 2) {
                BadgePill("Utvald", Icons.Filled.Star, Color(0.52f, 0.54f, 0.58f))
            }
            discountBadgeText(restaurant)?.let { BadgePill(it, Icons.Filled.LocalOffer, DeliveraTheme.orange) }
            if (orderMode == OrderMode.Pickup || displayFee(restaurant, orderMode) <= 0) {
                BadgePill(if (orderMode == OrderMode.Pickup) "Avhämtning" else "Fri leverans", null, DeliveraTheme.ink)
            }
        }
    }
}

@Composable
private fun BadgePill(text: String, icon: ImageVector?, background: Color) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(background).padding(horizontal = 8.dp, vertical = 4.5.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        icon?.let { Icon(it, null, tint = Color.White, modifier = Modifier.size(9.dp)) }
        Text(text, fontSize = 10.5.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1)
    }
}

private fun discountBadgeText(r: Restaurant): String? {
    val pct = r.dealMaxPercent ?: return null
    if (pct <= 0) return null
    return if (r.dealCoversAll == true) "-$pct%" else "upp till -$pct%"
}

private fun displayEta(r: Restaurant): Int = r.etaMinutes ?: 30
private fun displayFee(r: Restaurant, mode: OrderMode): Double = if (mode == OrderMode.Pickup) 0.0 else (r.deliveryFee ?: 0.0)
private fun feeText(r: Restaurant, mode: OrderMode): String {
    if (mode == OrderMode.Pickup) return "0 kr"
    val fee = displayFee(r, mode)
    return if (fee <= 0) "Gratis" else "${fee.toInt()} kr"
}
