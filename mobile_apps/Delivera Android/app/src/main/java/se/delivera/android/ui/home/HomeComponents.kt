package se.delivera.android.ui.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.DirectionsWalk
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.OrderMode
import se.delivera.android.ui.theme.DeliveraTheme

fun OrderMode.icon(): ImageVector =
    if (this == OrderMode.Delivery) Icons.Filled.ElectricBolt else Icons.Filled.DirectionsWalk

@Composable
fun HomeHeader(
    address: String,
    favoriteCount: Int,
    mode: OrderMode,
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    onAddressTap: () -> Unit,
    onFavoritesTap: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.clickable(onClick = onAddressTap),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    Modifier.size(42.dp).clip(CircleShape)
                        .background(DeliveraTheme.orange.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.LocationOn, null, tint = DeliveraTheme.orange, modifier = Modifier.size(19.dp))
                }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        if (mode == OrderMode.Delivery) "DELIVER TO" else "PICKUP IN",
                        fontSize = 10.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            address, fontSize = 15.sp, fontWeight = FontWeight.Black,
                            color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis
                        )
                        Icon(Icons.Filled.KeyboardArrowDown, null, tint = DeliveraTheme.ink.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            IconButton(
                icon = if (favoriteCount > 0) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                tint = if (favoriteCount > 0) DeliveraTheme.orange else DeliveraTheme.ink,
                badgeCount = favoriteCount, onClick = onFavoritesTap
            )
        }

        Row(
            Modifier.fillMaxWidth().height(40.dp)
                .clip(RoundedCornerShape(13.dp)).background(Color.White)
                .border(1.dp, DeliveraTheme.line, RoundedCornerShape(13.dp))
                .padding(horizontal = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Icon(Icons.Filled.Search, null, tint = DeliveraTheme.muted, modifier = Modifier.size(16.dp))
            Box(Modifier.weight(1f)) {
                if (searchQuery.isEmpty()) {
                    Text("Sök restaurang, sushi, pizza...", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = DeliveraTheme.muted)
                }
                BasicTextField(
                    value = searchQuery,
                    onValueChange = onSearchChange,
                    singleLine = true,
                    textStyle = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = DeliveraTheme.ink),
                    modifier = Modifier.fillMaxWidth()
                )
            }
            if (searchQuery.isNotEmpty()) {
                Icon(
                    Icons.Filled.Cancel, null, tint = DeliveraTheme.muted,
                    modifier = Modifier.size(16.dp).clickable { onSearchChange("") }
                )
            }
        }
    }
}

@Composable
fun IconButton(icon: ImageVector, tint: Color, badgeCount: Int = 0, onClick: () -> Unit) {
    Box(contentAlignment = Alignment.TopEnd) {
        Box(
            Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.94f))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp))
        }
        if (badgeCount > 0) {
            Box(
                Modifier.defaultMinSize(minWidth = 17.dp, minHeight = 17.dp)
                    .clip(RoundedCornerShape(50)).background(DeliveraTheme.orange)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(if (badgeCount > 99) "99+" else "$badgeCount", fontSize = 9.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
        }
    }
}

@Composable
fun SectionHeader(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text(subtitle, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = DeliveraTheme.muted)
    }
}

@Composable
fun CuisineChips(cuisines: List<String>, selected: String, onSelect: (String) -> Unit) {
    Row(
        Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        cuisines.forEach { cuisine ->
            val isSel = selected == cuisine
            Box(
                Modifier.height(38.dp).clip(RoundedCornerShape(50))
                    .background(if (isSel) DeliveraTheme.orange else Color.White)
                    .border(1.dp, DeliveraTheme.line, RoundedCornerShape(50))
                    .clickable { onSelect(cuisine) }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(cuisine, fontSize = 13.sp, fontWeight = FontWeight.Black, color = if (isSel) Color.White else DeliveraTheme.ink)
            }
        }
    }
}

@Composable
fun NoticeBanner(text: String) {
    Row(
        Modifier.clip(RoundedCornerShape(14.dp)).background(DeliveraTheme.orange.copy(alpha = 0.09f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Search, null, tint = DeliveraTheme.orange, modifier = Modifier.size(15.dp))
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.orange)
    }
}

@Composable
fun RatingBadge(value: Double) {
    Row(
        Modifier.height(26.dp).clip(RoundedCornerShape(50)).background(DeliveraTheme.ink)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(Icons.Filled.Star, null, tint = DeliveraTheme.gold, modifier = Modifier.size(12.dp))
        Text(String.format("%.1f", value), fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.White)
    }
}

@Composable
fun Metric(icon: ImageVector, text: String, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = DeliveraTheme.ink.copy(alpha = 0.66f), modifier = Modifier.size(12.dp))
        Text(
            text,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = DeliveraTheme.ink.copy(alpha = 0.66f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

val metricSchedule = Icons.Filled.Schedule
val metricPlace = Icons.Filled.Place
val ratingStar = Icons.Filled.Star
