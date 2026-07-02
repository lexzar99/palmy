package se.delivera.android.ui.cart

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeliveryDining
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import se.delivera.android.data.CartOrderItemRequest
import se.delivera.android.data.CartOrderRequest
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.HomeAppDeal
import se.delivera.android.data.OrderMode
import se.delivera.android.data.Prefs
import se.delivera.android.data.decodeDelivera
import se.delivera.android.ui.components.Entrance
import se.delivera.android.ui.theme.DeliveraTheme
import kotlin.math.max
import kotlin.math.roundToInt
import java.util.UUID

@Composable
fun CartScreen(
    cartStore: CartStore,
    authToken: String,
    isLoggedIn: Boolean,
    onExploreRestaurants: () -> Unit,
    onOpenProfile: () -> Unit,
    onOrderCreated: (orderId: String, accessToken: String?) -> Unit
) {
    val api = remember { DeliveraApi() }
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    var guestName by remember { mutableStateOf("") }
    var guestPhone by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var coupon by remember { mutableStateOf("") }
    var showContact by remember { mutableStateOf(!isLoggedIn) }
    var showNote by remember { mutableStateOf(false) }
    var showCoupon by remember { mutableStateOf(false) }
    var showTip by remember { mutableStateOf(false) }
    var tip by remember { mutableDoubleStateOf(0.0) }
    var discountAmount by remember { mutableDoubleStateOf(0.0) }
    var freeDelivery by remember { mutableStateOf(false) }
    var codeMessage by remember { mutableStateOf<String?>(null) }
    var codeOk by remember { mutableStateOf<Boolean?>(null) }
    var isApplyingCode by remember { mutableStateOf(false) }
    var paymentError by remember { mutableStateOf<String?>(null) }
    var paymentBusy by remember { mutableStateOf(false) }
    var paymentMessage by remember { mutableStateOf<String?>(null) }

    val activeDeal = remember(Prefs.getString(Prefs.KEY_ACTIVE_USER_DEAL_SNAPSHOT, "")) {
        runCatching {
            Prefs.getString(Prefs.KEY_ACTIVE_USER_DEAL_SNAPSHOT, "")
                .takeIf { it.isNotBlank() }
                ?.let { decodeDelivera<HomeAppDeal>(it) }
        }.getOrNull()
    }

    val delivery = if (freeDelivery) 0.0 else cartStore.displayedDeliveryFee
    val total = max(0.0, cartStore.subtotal + delivery + tip - discountAmount)
    val earnedPoints = if (isLoggedIn) max(0, cartStore.subtotal.roundToInt()) else 0
    val contentKey = cartStore.count to cartStore.restaurant.value?.id

    fun applyCode() {
        val trimmed = coupon.trim()
        if (trimmed.length < 3 || isApplyingCode) return
        scope.launch {
            isApplyingCode = true
            codeMessage = null
            codeOk = null
            runCatching { api.validateDiscount(trimmed, cartStore.subtotal, authToken.ifBlank { null }) }
                .onSuccess { response ->
                    discountAmount = response.discountAmount
                    freeDelivery = response.freeDelivery
                    codeMessage = "Rabattkod aktiverad"
                    codeOk = true
                }
                .onFailure { discountError ->
                    runCatching { api.redeemReferralCode(trimmed, authToken.ifBlank { null }) }
                        .onSuccess { response ->
                            response.deal?.let { deal ->
                                Prefs.setString(Prefs.KEY_ACTIVE_USER_DEAL_ID, deal.userDealId.orEmpty())
                                Prefs.setString(Prefs.KEY_ACTIVE_USER_DEAL_SNAPSHOT, se.delivera.android.data.deliveraJson.encodeToString(HomeAppDeal.serializer(), deal))
                            }
                            codeMessage = response.message ?: "Vänkod aktiverad"
                            codeOk = true
                        }
                        .onFailure {
                            codeMessage = discountError.message ?: "Koden kunde inte användas"
                            codeOk = false
                        }
                }
            isApplyingCode = false
        }
    }

    fun startPaymentCheck() {
        paymentError = null
        paymentMessage = null
        if (paymentBusy) return
        val initialName = if (isLoggedIn) guestName.trim().ifBlank { "Kund" } else guestName.trim()
        val initialPhone = if (isLoggedIn) {
            guestPhone.trim().ifBlank { Prefs.getString(Prefs.KEY_GUEST_PHONE, "") }
        } else {
            guestPhone.trim()
        }
        if (!isLoggedIn && initialName.length < 2) {
            showContact = true
            paymentError = "Skriv namn innan betalning."
            return
        }
        if (!isLoggedIn && initialPhone.length < 6) {
            showContact = true
            paymentError = "Skriv ett giltigt telefonnummer."
            return
        }
        val restaurant = cartStore.restaurant.value
        if (restaurant == null || cartStore.items.isEmpty()) {
            paymentError = "Lägg till något i varukorgen först."
            return
        }
        scope.launch {
            paymentBusy = true
            try {
                var resolvedName = initialName
                var resolvedPhone = initialPhone
                if (isLoggedIn && authToken.isNotBlank()) {
                    val profile = api.profile(authToken)
                    resolvedName = profile.displayName
                    resolvedPhone = profile.phone?.trim().orEmpty()
                    if (resolvedPhone.isNotBlank()) Prefs.setString(Prefs.KEY_GUEST_PHONE, resolvedPhone)
                }
                if (resolvedName.length < 2 || resolvedPhone.length < 6) {
                    showContact = true
                    paymentError = "Telefonnummer saknas på profilen. Lägg till nummer innan du beställer."
                    return@launch
                }
                val activeUserDealId = Prefs.getString(Prefs.KEY_ACTIVE_USER_DEAL_ID, "").ifBlank { null }
                val request = CartOrderRequest(
                    restaurantId = restaurant.id,
                    restaurantSlug = restaurant.slug,
                    type = if (cartStore.orderMode.value == OrderMode.Delivery) "DELIVERY" else "PICKUP",
                    customerName = resolvedName,
                    customerPhone = resolvedPhone,
                    deliveryStreet = if (cartStore.orderMode.value == OrderMode.Delivery) cartStore.address.value else null,
                    deliveryCity = if (cartStore.orderMode.value == OrderMode.Delivery) Prefs.getString(Prefs.KEY_DELIVERY_CITY, "") else null,
                    deliveryLatitude = Prefs.getDouble(Prefs.KEY_DELIVERY_LAT, 0.0).takeIf { it != 0.0 },
                    deliveryLongitude = Prefs.getDouble(Prefs.KEY_DELIVERY_LNG, 0.0).takeIf { it != 0.0 },
                    note = note.ifBlank { null },
                    discountCode = coupon.trim().takeIf { codeOk == true && it.isNotBlank() },
                    userDealId = activeUserDealId,
                    items = cartStore.items.map {
                        CartOrderItemRequest(productId = it.product.id, quantity = it.quantity)
                    },
                    lat = Prefs.getDouble(Prefs.KEY_DELIVERY_LAT, 0.0).takeIf { it != 0.0 },
                    lng = Prefs.getDouble(Prefs.KEY_DELIVERY_LNG, 0.0).takeIf { it != 0.0 },
                    pendingPayment = true,
                    tip = tip.takeIf { it > 0.0 }
                )
                val order = api.createOrder(
                    request = request,
                    idempotencyKey = "android-${UUID.randomUUID()}",
                    token = authToken.ifBlank { null }
                )
                val orderId = order.resolvedOrderId ?: error("Servern returnerade inget order-ID.")
                onOrderCreated(orderId, order.accessToken)
                val payment = api.createAdyenPayment(orderId, "delivera://order/$orderId")
                val checkoutUrl = payment.checkoutUrl
                if (!checkoutUrl.isNullOrBlank()) {
                    Prefs.setString("delivera.pendingOrderId", orderId)
                    order.accessToken?.let { Prefs.setString("delivera.pendingOrderToken", it) }
                    cartStore.clear()
                    uriHandler.openUri(checkoutUrl)
                } else if (payment.session != null) {
                    paymentMessage = "Order skapad. Native Adyen-session är redo: ${payment.session.id}"
                } else {
                    paymentMessage = "Order skapad. Öppna Mina beställningar för status."
                }
            } catch (e: Throwable) {
                paymentError = e.message ?: "Betalningen kunde inte startas."
            } finally {
                paymentBusy = false
            }
        }
    }

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Entrance(visibleKey = contentKey, delayMillis = 0) {
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
            }

            if (cartStore.items.isEmpty()) {
                item { Entrance(visibleKey = contentKey, delayMillis = 40) { EmptyCart(onExploreRestaurants) } }
            } else {
                item { Entrance(visibleKey = contentKey, delayMillis = 0) { OrderModeCard(cartStore) } }
                if (!isLoggedIn) {
                    item {
                        Entrance(visibleKey = contentKey, delayMillis = 40) {
                            ContactSection(
                                expanded = showContact,
                                onToggle = { showContact = !showContact },
                                guestName = guestName,
                                onNameChange = { guestName = it },
                                guestPhone = guestPhone,
                                onPhoneChange = { guestPhone = it }
                            )
                        }
                    }
                }
                item {
                    Entrance(visibleKey = contentKey, delayMillis = 80) {
                        SectionTitle("Artiklar")
                    }
                }
                items(cartStore.items, key = { it.product.id }) { item ->
                    Entrance(visibleKey = "${contentKey}-${item.product.id}-${item.quantity}", delayMillis = 90) {
                        CartItemRow(item, onMinus = { cartStore.decrement(item) }, onPlus = { cartStore.increment(item) })
                    }
                }
                if (cartStore.recommendedProducts.isNotEmpty()) {
                    item {
                        Entrance(visibleKey = contentKey, delayMillis = 120) {
                            RecommendedSection(cartStore)
                        }
                    }
                }
                item {
                    Entrance(visibleKey = contentKey, delayMillis = 160) {
                        CollapsedFields(
                            note = note,
                            onNoteChange = { note = it },
                            coupon = coupon,
                            onCouponChange = { coupon = it.uppercase() },
                            showNote = showNote,
                            showCoupon = showCoupon,
                            showTip = showTip,
                            tip = tip,
                            codeMessage = codeMessage,
                            codeOk = codeOk,
                            isApplyingCode = isApplyingCode,
                            onToggleNote = { showNote = !showNote },
                            onToggleCoupon = { showCoupon = !showCoupon },
                            onToggleTip = { showTip = !showTip },
                            onTip = { tip = it },
                            onApplyCode = ::applyCode
                        )
                    }
                }
                activeDeal?.let { deal ->
                    item {
                        Entrance(visibleKey = contentKey, delayMillis = 180) {
                            ActiveDealCard(deal = deal, isLoggedIn = isLoggedIn, onOpenProfile = onOpenProfile)
                        }
                    }
                }
                item {
                    Entrance(visibleKey = contentKey, delayMillis = 200) {
                        TotalsCard(
                            subtotal = cartStore.subtotal,
                            delivery = delivery,
                            discount = discountAmount,
                            tip = tip,
                            total = total,
                            earnedPoints = earnedPoints,
                            paymentError = paymentError,
                            paymentMessage = paymentMessage,
                            busy = paymentBusy,
                            onPay = ::startPaymentCheck
                        )
                    }
                }
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
private fun OrderModeCard(cartStore: CartStore) {
    val delivery = cartStore.orderMode.value == OrderMode.Delivery
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(15.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(if (delivery) Icons.Filled.DeliveryDining else Icons.Filled.Storefront, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(if (delivery) "Leverans" else "Avhämtning", fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
            Text(
                if (delivery) cartStore.address.value.ifBlank { "Adress väljs i hemmet" } else "Hämtas hos restaurangen",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = DeliveraTheme.muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun ContactSection(
    expanded: Boolean,
    onToggle: () -> Unit,
    guestName: String,
    onNameChange: (String) -> Unit,
    guestPhone: String,
    onPhoneChange: (String) -> Unit
) {
    CollapsibleSection(title = "Kontakt", expanded = expanded, icon = Icons.Filled.Person, onToggle = onToggle) {
        Field("Namn", guestName, onNameChange)
        Field("Telefonnummer", guestPhone, onPhoneChange, keyboardType = KeyboardType.Phone)
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(title, fontSize = 18.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
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
            Text(price(item.product.effectivePrice), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        }
        QuantityControl(item.quantity, onMinus, onPlus)
        Text(price(item.total), fontSize = 14.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
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
private fun RecommendedSection(cartStore: CartStore) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle(if (cartStore.recommendedProducts.any { it.name.contains("dryck", true) }) "Glömde du drycken?" else "Ofta köpta med")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(cartStore.recommendedProducts, key = { "rec-${it.id}" }) { product ->
                Row(
                    Modifier.size(width = 214.dp, height = 74.dp).clip(RoundedCornerShape(18.dp)).background(Color.White)
                        .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).clickable { cartStore.addRecommended(product) }.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(product.name, fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(price(product.effectivePrice), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
                    }
                    Box(Modifier.size(30.dp).clip(CircleShape).background(DeliveraTheme.ink), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Add, null, tint = Color.White, modifier = Modifier.size(17.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun CollapsedFields(
    note: String,
    onNoteChange: (String) -> Unit,
    coupon: String,
    onCouponChange: (String) -> Unit,
    showNote: Boolean,
    showCoupon: Boolean,
    showTip: Boolean,
    tip: Double,
    codeMessage: String?,
    codeOk: Boolean?,
    isApplyingCode: Boolean,
    onToggleNote: () -> Unit,
    onToggleCoupon: () -> Unit,
    onToggleTip: () -> Unit,
    onTip: (Double) -> Unit,
    onApplyCode: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        CollapsibleSection("Extra notering", showNote, Icons.Filled.EditNote, onToggleNote) {
            Field("Ex. ring inte på dörren", note, onNoteChange, singleLine = false)
        }
        CollapsibleSection("Rabatt- eller vänkod", showCoupon, Icons.Filled.LocalOffer, onToggleCoupon) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Field(
                    title = "Kod",
                    value = coupon,
                    onValueChange = onCouponChange,
                    modifier = Modifier.weight(1f),
                    capitalization = KeyboardCapitalization.Characters
                )
                Text(
                    if (isApplyingCode) "..." else "Checka",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.height(52.dp).clip(RoundedCornerShape(14.dp)).background(DeliveraTheme.orange)
                        .clickable(enabled = !isApplyingCode) { onApplyCode() }.padding(horizontal = 16.dp, vertical = 17.dp)
                )
            }
            codeMessage?.let { message ->
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, null, tint = if (codeOk == true) Color(0xFF2F8F4E) else DeliveraTheme.orange, modifier = Modifier.size(16.dp))
                    Text(message, fontSize = 12.sp, fontWeight = FontWeight.Black, color = if (codeOk == true) Color(0xFF2F8F4E) else DeliveraTheme.orange)
                }
            }
        }
        CollapsibleSection("Dricks", showTip, Icons.Filled.Favorite, onToggleTip) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf<Double>(0.0, 10.0, 20.0, 30.0).forEach { value ->
                    val selected = tip == value
                    Text(
                        if (value == 0.0) "Ingen" else price(value),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        color = if (selected) Color.White else DeliveraTheme.ink,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(50))
                            .background(if (selected) DeliveraTheme.orange else Color.Black.copy(alpha = 0.045f))
                            .clickable { onTip(value) }
                            .padding(top = 10.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun CollapsibleSection(
    title: String,
    expanded: Boolean,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onToggle: () -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).clickable { onToggle() }.padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(icon, null, tint = DeliveraTheme.orange, modifier = Modifier.size(18.dp))
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, modifier = Modifier.weight(1f))
            Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null, tint = DeliveraTheme.muted, modifier = Modifier.size(19.dp))
        }
        if (expanded) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
        }
    }
}

@Composable
private fun Field(
    title: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.None,
    singleLine: Boolean = true
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        label = { Text(title) },
        singleLine = singleLine,
        minLines = if (singleLine) 1 else 3,
        maxLines = if (singleLine) 1 else 3,
        keyboardOptions = KeyboardOptions(capitalization = capitalization, keyboardType = keyboardType)
    )
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
            Text(if (isLoggedIn) "Aktiv i kassan" else "Logga in för att spara dealen.", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.82f))
        }
    }
}

@Composable
private fun TotalsCard(
    subtotal: Double,
    delivery: Double,
    discount: Double,
    tip: Double,
    total: Double,
    earnedPoints: Int,
    paymentError: String?,
    paymentMessage: String?,
    busy: Boolean,
    onPay: () -> Unit
) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(20.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        TotalLine("Subtotal", price(subtotal))
        TotalLine("Leverans", if (delivery <= 0.0) "Gratis" else price(delivery))
        if (discount > 0.0) TotalLine("Rabatt", "-${price(discount)}")
        if (tip > 0.0) TotalLine("Dricks", price(tip))
        if (earnedPoints >= 1) {
            Text("Du får ~${earnedPoints} Dpoints tillbaka", fontSize = 12.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
        }
        Spacer(Modifier.height(1.dp).fillMaxWidth().background(DeliveraTheme.line))
        TotalLine("Totalt", price(total), bold = true)
        paymentError?.let {
            Text(it, fontSize = 12.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
        }
        paymentMessage?.let {
            Text(it, fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color(0xFF2F8F4E))
        }
        Row(
            Modifier.fillMaxWidth().height(58.dp).clip(RoundedCornerShape(18.dp)).background(DeliveraTheme.ink)
                .clickable(enabled = !busy) { onPay() }.padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(if (busy) "Startar..." else "Betala", fontSize = 17.sp, fontWeight = FontWeight.Black, color = Color.White)
            Spacer(Modifier.weight(1f))
            Text(price(total), fontSize = 19.sp, fontWeight = FontWeight.Black, color = Color.White)
        }
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

private fun price(value: Double): String = "${value.roundToInt()} kr"
