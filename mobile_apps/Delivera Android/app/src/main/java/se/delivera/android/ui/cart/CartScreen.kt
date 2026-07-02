package se.delivera.android.ui.cart

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.HomeAppDeal
import se.delivera.android.data.Prefs
import se.delivera.android.data.decodeDelivera
import se.delivera.android.ui.theme.DeliveraTheme

@Composable
fun CartScreen(
    cartStore: CartStore,
    isLoggedIn: Boolean,
    onExploreRestaurants: () -> Unit,
    onOpenProfile: () -> Unit
) {
    val activeDeal = remember(Prefs.getString(Prefs.KEY_ACTIVE_USER_DEAL_SNAPSHOT, "")) {
        runCatching {
            Prefs.getString(Prefs.KEY_ACTIVE_USER_DEAL_SNAPSHOT, "")
                .takeIf { it.isNotBlank() }
                ?.let { decodeDelivera<HomeAppDeal>(it) }
        }.getOrNull()
    }

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Varukorg", fontSize = 34.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                    Text(
                        cartStore.restaurant.value?.name ?: "Lägg till något gott från en restaurang.",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = DeliveraTheme.muted,
                        maxLines = 2
                    )
                }
            }

            if (cartStore.items.isEmpty()) {
                item { EmptyCart(onExploreRestaurants) }
            } else {
                item {
                    CartContextCard(cartStore)
                }
                items(cartStore.items, key = { it.product.id }) { item ->
                    CartItemRow(item, onMinus = { cartStore.decrement(item) }, onPlus = { cartStore.increment(item) })
                }
                activeDeal?.let { deal ->
                    item { ActiveDealCard(deal = deal, isLoggedIn = isLoggedIn, onOpenProfile = onOpenProfile) }
                }
                if (cartStore.recommendedProducts.isNotEmpty()) {
                    item {
                        Text("Glöm inte", fontSize = 21.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                    }
                    items(cartStore.recommendedProducts, key = { "rec-${it.id}" }) { product ->
                        Text(
                            product.name,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = DeliveraTheme.ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White)
                                .border(1.dp, DeliveraTheme.line, RoundedCornerShape(14.dp)).padding(14.dp)
                        )
                    }
                }
                item { TotalsCard(cartStore) }
            }
        }
    }
}

@Composable
private fun EmptyCart(onExploreRestaurants: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(24.dp)).padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(Modifier.size(58.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.ShoppingBag, null, tint = DeliveraTheme.orange, modifier = Modifier.size(27.dp))
        }
        Text("Din korg är tom", fontSize = 22.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text("Hitta en restaurang och lägg till din första rätt.", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        Text(
            "Utforska",
            fontSize = 14.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(DeliveraTheme.orange).clickable { onExploreRestaurants() }
                .padding(horizontal = 18.dp, vertical = 11.dp)
        )
    }
}

@Composable
private fun CartContextCard(cartStore: CartStore) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.ShoppingBag, null, tint = DeliveraTheme.orange, modifier = Modifier.size(19.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(cartStore.restaurant.value?.name ?: "Restaurang", fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1)
            Text(cartStore.address.value.ifBlank { "Adress väljs i hemmet" }, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun CartItemRow(item: CartItem, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(item.product.name, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${item.product.effectivePrice.toInt()} kr", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        }
        QuantityControl(item.quantity, onMinus, onPlus)
        Text("${item.total.toInt()} kr", fontSize = 14.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
    }
}

@Composable
private fun QuantityControl(quantity: Int, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(
        Modifier.height(34.dp).clip(RoundedCornerShape(50)).background(DeliveraTheme.ink),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(if (quantity <= 1) Icons.Filled.Delete else Icons.Filled.Remove, null, tint = Color.White, modifier = Modifier.size(30.dp).padding(7.dp).clickable { onMinus() })
        Text("$quantity", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White, modifier = Modifier.padding(horizontal = 4.dp))
        Icon(Icons.Filled.Add, null, tint = Color.White, modifier = Modifier.size(30.dp).padding(7.dp).clickable { onPlus() })
    }
}

@Composable
private fun ActiveDealCard(deal: HomeAppDeal, isLoggedIn: Boolean, onOpenProfile: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(DeliveraTheme.dealBlue)
            .clickable(enabled = !isLoggedIn) { onOpenProfile() }.padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.LocalOffer, null, tint = Color.White, modifier = Modifier.size(19.dp))
        Column(Modifier.weight(1f)) {
            Text(deal.title, fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (isLoggedIn) "Servern validerar dealen i kassan." else "Logga in för att spara dealen.", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.82f))
        }
    }
}

@Composable
private fun TotalsCard(cartStore: CartStore) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(20.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        TotalLine("Mat", "${cartStore.subtotal.toInt()} kr")
        TotalLine("Leverans", if (cartStore.displayedDeliveryFee <= 0) "Gratis" else "${cartStore.displayedDeliveryFee.toInt()} kr")
        Spacer(Modifier.height(1.dp).fillMaxWidth().background(DeliveraTheme.line))
        TotalLine("Totalt", "${cartStore.total.toInt()} kr", bold = true)
        Text(
            "Fortsätt till betalning",
            fontSize = 15.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp)).background(DeliveraTheme.orange).padding(top = 15.dp)
        )
    }
}

@Composable
private fun TotalLine(title: String, value: String, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = if (bold) 17.sp else 14.sp, fontWeight = if (bold) FontWeight.Black else FontWeight.Bold, color = DeliveraTheme.ink)
        Spacer(Modifier.weight(1f))
        Text(value, fontSize = if (bold) 17.sp else 14.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
    }
}
