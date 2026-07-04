package se.delivera.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.FavoriteClaimResponse
import se.delivera.android.data.HomePulseModule
import se.delivera.android.data.PulseProduct
import se.delivera.android.ui.RemoteImage
import se.delivera.android.ui.theme.DeliveraTheme
import se.delivera.android.ui.theme.cardShadow
import kotlin.math.roundToInt

/* ------------------------------------------------------------------ */
/* TODO(data): the fields below belong on HomePulseModule in           */
/* data/Models.kt (Swift: `dropProduct` decodes the `product` key as a */
/* PulseProduct, plus `percent`). The data/ folder is owned by another */
/* agent right now, so until those fields exist these stubs return     */
/* null and the FAVORITE module simply does not render.                */
/* ------------------------------------------------------------------ */

val HomePulseModule.favoriteProduct: PulseProduct?
    get() = null // TODO(data): return the module's `product` decoded as PulseProduct.

val HomePulseModule.favoritePercent: Int?
    get() = null // TODO(data): return the module's `percent` field.

/** Claim via the data layer (POST /api/deals/app/favorite/claim). */
suspend fun DeliveraApi.claimFavoriteDeal(productId: String, token: String): FavoriteClaimResponse =
    claimFavorite(productId, token)

/* ------------------------------------------------------------------ */
/* FavoriteCard (PulseCards.swift): framed product, band, discount.    */
/* ------------------------------------------------------------------ */

@Composable
fun FavoriteCard(module: HomePulseModule, product: PulseProduct, onTap: () -> Unit) {
    val percent = module.favoritePercent ?: 10
    val newPrice = (product.priceKr * (100 - percent) / 100.0).roundToInt()

    Row(
        Modifier
            .fillMaxWidth()
            .cardShadow(22.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(PulseThemes.gradient(module.theme))
            .clickable(onClick = onTap)
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // The product in a double frame, gold outermost, white innermost.
        Box(contentAlignment = Alignment.Center) {
            Box(Modifier.size(92.dp).clip(RoundedCornerShape(20.dp)).background(DeliveraTheme.gold))
            Box(Modifier.size(84.dp).clip(RoundedCornerShape(16.dp)).background(Color.White))
            if (product.imageUrl != null) {
                RemoteImage(
                    product.imageUrl,
                    modifier = Modifier.size(78.dp).clip(RoundedCornerShape(14.dp)),
                    contentScale = ContentScale.Crop
                )
            } else {
                Icon(Icons.Filled.Favorite, null, tint = DeliveraTheme.orange, modifier = Modifier.size(26.dp))
            }
            Box(
                Modifier.align(Alignment.TopCenter).offset(y = (-7).dp).height(17.dp)
                    .clip(RoundedCornerShape(50)).background(DeliveraTheme.orange).padding(horizontal = 7.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("DIN FAVORIT", fontSize = 8.sp, letterSpacing = 0.8.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
        }

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(product.name, fontSize = 17.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
            module.subtitle?.let {
                Text(it, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.85f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${product.priceKr.toInt()} kr",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White.copy(alpha = 0.6f),
                    textDecoration = TextDecoration.LineThrough
                )
                Text("$newPrice kr", fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
        }

        Box(
            Modifier.height(34.dp).clip(RoundedCornerShape(50)).background(Color.White).padding(horizontal = 11.dp),
            contentAlignment = Alignment.Center
        ) {
            Text("-$percent%", fontSize = 15.sp, fontWeight = FontWeight.Black, color = PulseThemes.chipInk(module.theme))
        }
    }
}

/* ------------------------------------------------------------------ */
/* FavoriteOfferSheet (PulseCards.swift): the framed product, price    */
/* drops, added straight to the cart.                                  */
/* ------------------------------------------------------------------ */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoriteOfferSheet(
    module: HomePulseModule,
    product: PulseProduct,
    isWorking: Boolean,
    errorMessage: String?,
    onAdd: () -> Unit,
    onClose: () -> Unit
) {
    val percent = module.favoritePercent ?: 10
    val newPrice = (product.priceKr * (100 - percent) / 100.0).roundToInt()

    ModalBottomSheet(onDismissRequest = onClose, containerColor = Color.White) {
        Column(
            Modifier.fillMaxWidth().padding(bottom = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Box(Modifier.padding(top = 6.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(204.dp).clip(RoundedCornerShape(30.dp)).background(DeliveraTheme.gold))
                Box(Modifier.size(192.dp).clip(RoundedCornerShape(25.dp)).background(Color.White))
                if (product.imageUrl != null) {
                    RemoteImage(
                        product.imageUrl,
                        modifier = Modifier.size(182.dp).clip(RoundedCornerShape(22.dp)),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Icon(Icons.Filled.Favorite, null, tint = DeliveraTheme.orange, modifier = Modifier.size(52.dp))
                }
                Box(
                    Modifier.align(Alignment.TopCenter).offset(y = (-12).dp).height(26.dp)
                        .clip(RoundedCornerShape(50)).background(DeliveraTheme.orange).padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("DIN FAVORIT", fontSize = 11.sp, letterSpacing = 1.sp, fontWeight = FontWeight.Black, color = Color.White)
                }
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(product.name, fontSize = 24.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, textAlign = TextAlign.Center)
                Text("hos ${product.restaurant.name}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
                module.subtitle?.let {
                    Text(it, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.dealBlue)
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Bottom) {
                Text(
                    "${product.priceKr.toInt()} kr",
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Black,
                    color = DeliveraTheme.muted,
                    textDecoration = TextDecoration.LineThrough
                )
                Text("$newPrice kr", fontSize = 34.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                Box(
                    Modifier.height(26.dp).clip(RoundedCornerShape(50)).background(Color(0.13f, 0.58f, 0.36f)).padding(horizontal = 9.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("-$percent%", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White)
                }
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .height(58.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(DeliveraTheme.orange)
                    .clickable(enabled = !isWorking, onClick = onAdd),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (isWorking) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Icon(Icons.Filled.AddShoppingCart, null, tint = Color.White, modifier = Modifier.size(18.dp))
                }
                Text("Välj och lägg till", fontSize = 17.sp, fontWeight = FontWeight.Black, color = Color.White)
            }

            if (errorMessage != null) {
                Row(
                    Modifier.padding(horizontal = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Filled.Error, null, tint = DeliveraTheme.orange, modifier = Modifier.size(14.dp))
                    Text(errorMessage, fontSize = 12.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange, textAlign = TextAlign.Center)
                }
            } else {
                Text("Välj dina tillval, rabatten dras i kassan", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
            }

            Text(
                "Inte nu",
                fontSize = 14.sp,
                fontWeight = FontWeight.Black,
                color = DeliveraTheme.muted,
                modifier = Modifier.clickable(onClick = onClose).padding(bottom = 14.dp)
            )
        }
    }
}
