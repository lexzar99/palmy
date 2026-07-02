package se.delivera.android.ui.order

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.LocalDining
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import se.delivera.android.data.CustomerOrderResponse
import se.delivera.android.data.DeliveraApi
import se.delivera.android.ui.components.Entrance
import se.delivera.android.ui.theme.DeliveraTheme
import kotlin.math.roundToInt

@Composable
fun OrderTrackingScreen(
    orderId: String,
    phone: String?,
    accessToken: String?,
    authToken: String?,
    onBackHome: () -> Unit
) {
    val api = remember { DeliveraApi() }
    val scope = rememberCoroutineScope()
    var order by remember { mutableStateOf<CustomerOrderResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reviewRating by remember { mutableStateOf(5) }
    var reviewText by remember { mutableStateOf("") }
    var reviewBusy by remember { mutableStateOf(false) }
    var reviewMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(orderId, phone, accessToken, authToken) {
        while (true) {
            runCatching { api.customerOrder(orderId, phone, accessToken, authToken) }
                .onSuccess {
                    order = it
                    error = null
                }
                .onFailure { error = it.message ?: "Kunde inte hämta ordern." }
            delay(12_000)
        }
    }

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 90.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(
                        Modifier.size(42.dp).clip(CircleShape).background(Color.White)
                            .border(1.dp, DeliveraTheme.line, CircleShape).clickable { onBackHome() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Filled.ArrowBack, null, tint = DeliveraTheme.ink, modifier = Modifier.size(20.dp))
                    }
                    Column {
                        Text("Orderstatus", fontSize = 30.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                        Text(order?.restaurantName ?: "Vi hämtar din order", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
                    }
                }
            }

            error?.let {
                item { ErrorCard(it) }
            }

            val current = order
            if (current == null) {
                item { LoadingCard() }
            } else {
                item { Entrance { StatusHero(current) } }
                item { StepStrip(current.status, current.type) }
                item { ReceiptCard(current) }
                if (current.isReviewable && current.rating == null) {
                    item {
                        ReviewCard(
                            rating = reviewRating,
                            text = reviewText,
                            busy = reviewBusy,
                            message = reviewMessage,
                            onRating = { reviewRating = it },
                            onText = { reviewText = it },
                            onSubmit = {
                                scope.launch {
                                    reviewBusy = true
                                    reviewMessage = null
                                    runCatching {
                                        api.reviewOrder(
                                            orderId = current.id,
                                            rating = reviewRating,
                                            review = reviewText,
                                            phone = phone,
                                            accessToken = accessToken,
                                            authToken = authToken
                                        )
                                    }.onSuccess { response ->
                                        val points = response.dpoints?.points ?: 0
                                        reviewMessage = if (points > 0) "+$points Dpoints lades till." else "Tack för din recension."
                                        order = current.copy(rating = reviewRating)
                                    }.onFailure {
                                        reviewMessage = it.message ?: "Kunde inte spara recensionen."
                                    }
                                    reviewBusy = false
                                }
                            }
                        )
                    }
                } else if (current.rating != null || reviewMessage != null) {
                    item { ReviewThanksCard(reviewMessage ?: "Tack för recensionen.") }
                }
                if (current.items.isNotEmpty()) {
                    item { SectionTitle("Din order") }
                    items(current.items, key = { "${it.productName}-${it.quantity}-${it.subtotal}" }) { item ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White)
                                .border(1.dp, DeliveraTheme.line, RoundedCornerShape(16.dp)).padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("${item.quantity}×", fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
                            Text(
                                item.productName,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Black,
                                color = DeliveraTheme.ink,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(start = 8.dp).weight(1f)
                            )
                            item.subtotal?.let { Text("${it.roundToInt()} kr", fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewCard(
    rating: Int,
    text: String,
    busy: Boolean,
    message: String?,
    onRating: (Int) -> Unit,
    onText: (String) -> Unit,
    onSubmit: () -> Unit
) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Hur var ordern?", fontSize = 20.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text("Sätt stjärnor och få Dpoints.", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            (1..5).forEach { value ->
                Icon(
                    Icons.Filled.Star,
                    null,
                    tint = if (value <= rating) DeliveraTheme.orange else DeliveraTheme.line,
                    modifier = Modifier.size(34.dp).clickable { onRating(value) }
                )
            }
        }
        OutlinedTextField(
            value = text,
            onValueChange = onText,
            label = { Text("Kort recension") },
            minLines = 2,
            maxLines = 3,
            modifier = Modifier.fillMaxWidth()
        )
        Text(
            if (busy) "Skickar..." else "Skicka recension",
            fontSize = 14.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp))
                .background(if (busy) DeliveraTheme.muted else DeliveraTheme.orange)
                .clickable(enabled = !busy) { onSubmit() }
                .padding(top = 14.dp)
        )
        message?.let { Text(it, fontSize = 12.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange) }
    }
}

@Composable
private fun ReviewThanksCard(message: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Star, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
        Text(message, fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
    }
}

@Composable
private fun StatusHero(order: CustomerOrderResponse) {
    val visual = statusVisual(order.status)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(visual.bg)
            .border(1.dp, visual.border, RoundedCornerShape(26.dp)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(54.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.22f)), contentAlignment = Alignment.Center) {
                Icon(visual.icon, null, tint = visual.fg, modifier = Modifier.size(28.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(statusTitle(order.status, order.type), fontSize = 24.sp, fontWeight = FontWeight.Black, color = visual.fg)
                Text(order.etaEndsAt ?: order.createdAt ?: "Vi uppdaterar status automatiskt.", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = visual.fg.copy(alpha = 0.78f))
            }
        }
        val points = order.dpointsEarned ?: order.pointsEarned
        if (points != null && points > 0) {
            Text("+$points Dpoints på den här beställningen", fontSize = 13.sp, fontWeight = FontWeight.Black, color = visual.fg)
        }
    }
}

@Composable
private fun StepStrip(status: String, type: String?) {
    val delivery = type != "PICKUP"
    val steps = if (delivery) listOf("Granskas", "Lagas", "På väg", "Levererad") else listOf("Mottagen", "Lagas", "Klar")
    val reached = when (status) {
        "AWAITING_PAYMENT", "PENDING", "ACCEPTED" -> 0
        "PREPARING" -> 1
        "READY" -> if (delivery) 1 else 2
        "DELIVERING" -> 2
        "DELIVERED", "COMPLETED" -> steps.lastIndex
        else -> 0
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(20.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        steps.forEachIndexed { index, label ->
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    Modifier.size(28.dp).clip(CircleShape)
                        .background(if (index <= reached) DeliveraTheme.orange else Color.Black.copy(alpha = 0.06f)),
                    contentAlignment = Alignment.Center
                ) {
                    if (index <= reached) Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(16.dp))
                }
                Text(label, fontSize = 10.sp, fontWeight = FontWeight.Black, color = if (index <= reached) DeliveraTheme.ink else DeliveraTheme.muted)
            }
        }
    }
}

@Composable
private fun ReceiptCard(order: CustomerOrderResponse) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(20.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.ReceiptLong, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
            Text("Kvitto", fontSize = 17.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        }
        TotalLine("Leverans", order.deliveryFee?.let { if (it <= 0.0) "Gratis" else "${it.roundToInt()} kr" } ?: "-")
        order.discountAmount?.takeIf { it > 0.0 }?.let { TotalLine("Rabatt", "-${it.roundToInt()} kr") }
        TotalLine("Totalt", "${order.total.roundToInt()} kr", bold = true)
    }
}

@Composable
private fun ErrorCard(message: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.orange.copy(alpha = 0.22f), RoundedCornerShape(18.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.ErrorOutline, null, tint = DeliveraTheme.orange)
        Text(message, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.ink)
    }
}

@Composable
private fun LoadingCard() {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(22.dp)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text("Hämtar ordern", fontSize = 22.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text("Status visas här så fort servern svarar.", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(title, fontSize = 18.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
}

@Composable
private fun TotalLine(title: String, value: String, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = if (bold) 16.sp else 14.sp, fontWeight = if (bold) FontWeight.Black else FontWeight.Bold, color = DeliveraTheme.ink)
        Spacer(Modifier.weight(1f))
        Text(value, fontSize = if (bold) 17.sp else 14.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
    }
}

private data class StatusVisual(val icon: ImageVector, val bg: Color, val fg: Color, val border: Color)

private fun statusVisual(status: String): StatusVisual = when (status) {
    "PREPARING", "READY" -> StatusVisual(Icons.Filled.LocalDining, DeliveraTheme.orange.copy(alpha = 0.12f), DeliveraTheme.orange, DeliveraTheme.orange.copy(alpha = 0.18f))
    "DELIVERING" -> StatusVisual(Icons.Filled.TwoWheeler, DeliveraTheme.dealBlue, Color.White, DeliveraTheme.dealBlue)
    "DELIVERED", "COMPLETED" -> StatusVisual(Icons.Filled.Check, Color(0xFFEAF7EE), Color(0xFF2F8F4E), Color(0x332F8F4E))
    "CANCELLED", "REJECTED", "DELIVERY_FAILED" -> StatusVisual(Icons.Filled.ErrorOutline, Color(0xFFFFF0EE), DeliveraTheme.orange, DeliveraTheme.orange.copy(alpha = 0.2f))
    else -> StatusVisual(Icons.Filled.ReceiptLong, Color.White, DeliveraTheme.ink, DeliveraTheme.line)
}

private fun statusTitle(status: String, type: String?): String = when (status) {
    "AWAITING_PAYMENT" -> "Väntar på betalning"
    "PENDING" -> "Skickad till restaurangen"
    "ACCEPTED" -> "Restaurangen har accepterat"
    "PREPARING" -> "Maten lagas"
    "READY" -> if (type == "PICKUP") "Klar för avhämtning" else "Redo för bud"
    "DELIVERING" -> "På väg"
    "DELIVERED", "COMPLETED" -> "Levererad"
    "CANCELLED", "REJECTED" -> "Ordern avbröts"
    "DELIVERY_FAILED" -> "Leveransen misslyckades"
    else -> status
}

private val CustomerOrderResponse.isReviewable: Boolean
    get() = status == "DELIVERED" || status == "COMPLETED" || status == "READY"
