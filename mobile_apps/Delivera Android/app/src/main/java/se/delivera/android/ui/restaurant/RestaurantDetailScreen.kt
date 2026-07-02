package se.delivera.android.ui.restaurant

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.MenuCategory
import se.delivera.android.data.MenuProduct
import se.delivera.android.data.OrderMode
import se.delivera.android.data.Restaurant
import se.delivera.android.ui.RemoteImage
import se.delivera.android.ui.cart.CartStore
import se.delivera.android.ui.theme.DeliveraTheme

/**
 * Simplified restaurant detail: hero, header, live menu load. The full 1:1 port
 * (extras sheet, cart wiring, reviews, opening-hours) lands in the next pass.
 */
@Composable
fun RestaurantDetailScreen(
    restaurant: Restaurant,
    orderMode: OrderMode,
    activeAddress: String,
    cartStore: CartStore,
    onBack: () -> Unit,
    onOpenCart: () -> Unit,
    api: DeliveraApi = DeliveraApi()
) {
    var categories by remember { mutableStateOf<List<MenuCategory>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(restaurant.slug) {
        loading = true
        runCatching { api.menu(restaurant.slug) }
            .onSuccess { categories = it.categories; error = null }
            .onFailure { error = it.message }
        loading = false
    }

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        LazyColumn(contentPadding = PaddingValues(bottom = 120.dp)) {
            item {
                Box(Modifier.fillMaxWidth().height(250.dp)) {
                    RemoteImage(
                        urlString = restaurant.heroImageUrl ?: restaurant.imageUrl,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                    Box(
                        Modifier.padding(16.dp).size(40.dp).clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.94f)).clickable { onBack() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Tillbaka", tint = DeliveraTheme.ink, modifier = Modifier.size(20.dp))
                    }
                }
            }
            item {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(restaurant.name, fontSize = 28.sp, lineHeight = 31.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(
                                restaurant.cuisine?.replaceFirstChar { it.uppercase() } ?: restaurant.description ?: "Restaurang",
                                fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = DeliveraTheme.muted, maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                        }
                        RatingBadge(restaurant.rating ?: 4.7)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MetricPill("${restaurant.etaMinutes ?: 30} min")
                        MetricPill(if (orderMode == OrderMode.Pickup) "Avhämtning" else feeText(restaurant.deliveryFee ?: 0.0))
                        restaurant.city?.takeIf { it.isNotBlank() }?.let { MetricPill(it) }
                    }
                    if ((restaurant.dealMaxPercent ?: 0) > 0) {
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(DeliveraTheme.orange.copy(alpha = 0.1f))
                                .border(1.dp, DeliveraTheme.orange.copy(alpha = 0.18f), RoundedCornerShape(16.dp)).padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Filled.LocalOffer, null, tint = DeliveraTheme.orange, modifier = Modifier.size(18.dp))
                            Text(
                                if (restaurant.dealCoversAll == true) "-${restaurant.dealMaxPercent}% på menyn" else "Upp till -${restaurant.dealMaxPercent}% här",
                                fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange
                            )
                        }
                    }
                }
            }

            error?.let { msg ->
                item { Text(msg, color = DeliveraTheme.orange, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp)) }
            }

            categories.forEach { category ->
                item(key = "cat-${category.id}") {
                    Text(
                        category.name, fontSize = 20.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink,
                        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 8.dp)
                    )
                }
                items(category.products, key = { "prod-${it.id}" }) { product ->
                    ProductRow(
                        product = product,
                        onAdd = {
                            cartStore.add(
                                product = product,
                                restaurant = restaurant,
                                orderMode = orderMode,
                                address = activeAddress,
                                deliveryFee = restaurant.deliveryFee ?: 0.0,
                                categories = categories
                            )
                        }
                    )
                }
            }
        }

        if (cartStore.count > 0 && cartStore.restaurant.value?.id == restaurant.id) {
            Row(
                Modifier.align(Alignment.BottomCenter).padding(20.dp).fillMaxWidth().height(58.dp)
                    .clip(RoundedCornerShape(18.dp)).background(DeliveraTheme.ink).clickable { onOpenCart() }.padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.ShoppingBag, null, tint = Color.White, modifier = Modifier.size(20.dp))
                Text("${cartStore.count} varor", fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White)
                Spacer(Modifier.weight(1f))
                Text("${cartStore.total.toInt()} kr", fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
        }
    }
}

@Composable
private fun ProductRow(product: MenuProduct, onAdd: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)
            .clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(product.name, fontSize = 16.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            product.description?.takeIf { it.isNotBlank() && product.hideDescription != true }?.let {
                Text(it, fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium, color = DeliveraTheme.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text("${product.effectivePrice.toInt()} kr", fontSize = 14.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
        }
        if (product.hasImage) {
            RemoteImage(
                urlString = product.imageUrl,
                modifier = Modifier.size(74.dp).clip(RoundedCornerShape(14.dp)),
                contentScale = ContentScale.Crop
            )
        }
        Box(Modifier.size(36.dp).clip(CircleShape).background(DeliveraTheme.orange).clickable { onAdd() }, contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Add, null, tint = Color.White, modifier = Modifier.size(19.dp))
        }
    }
}

@Composable
private fun RatingBadge(value: Double) {
    Row(
        Modifier.height(28.dp).clip(RoundedCornerShape(50)).background(DeliveraTheme.ink).padding(horizontal = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Star, null, tint = DeliveraTheme.gold, modifier = Modifier.size(12.dp))
        Text(String.format("%.1f", value), fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.White)
    }
}

@Composable
private fun MetricPill(text: String) {
    Text(
        text,
        fontSize = 12.sp,
        fontWeight = FontWeight.Black,
        color = DeliveraTheme.ink.copy(alpha = 0.72f),
        maxLines = 1,
        modifier = Modifier.height(30.dp).clip(RoundedCornerShape(50)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 7.dp)
    )
}

private fun feeText(fee: Double): String = if (fee <= 0) "Fri leverans" else "${fee.toInt()} kr"
