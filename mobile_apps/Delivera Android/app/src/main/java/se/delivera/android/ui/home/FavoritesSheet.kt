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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.Restaurant
import se.delivera.android.ui.RemoteImage
import se.delivera.android.ui.theme.DeliveraTheme

/** Port of FavoritesSheetView (HomeView.swift): saved restaurants in a bottom sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesSheet(
    restaurants: List<Restaurant>,
    onDismiss: () -> Unit,
    onOpen: (Restaurant) -> Unit,
    onToggleFavorite: (Restaurant) -> Unit
) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color(0.99f, 0.98f, 0.95f)) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Favoriter", fontSize = 32.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                Text(
                    if (restaurants.isEmpty()) "Dina sparade restauranger visas här." else "${restaurants.size} sparade restauranger",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = DeliveraTheme.muted
                )
            }

            if (restaurants.isEmpty()) {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 34.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        Modifier.size(74.dp).clip(CircleShape).background(Color.White),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Filled.FavoriteBorder, null, tint = DeliveraTheme.orange, modifier = Modifier.size(34.dp))
                    }
                    Text("Inga favoriter ännu", fontSize = 22.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                    Text(
                        "Tryck på hjärtat på en restaurang så hamnar den här.",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = DeliveraTheme.muted,
                        textAlign = TextAlign.Center
                    )
                }
            } else {
                restaurants.forEach { restaurant ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(20.dp))
                            .background(Color.White)
                            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(20.dp))
                            .clickable { onOpen(restaurant) }
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (restaurant.hasImage) {
                            RemoteImage(
                                restaurant.heroImageUrl ?: restaurant.imageUrl,
                                modifier = Modifier.size(66.dp).clip(RoundedCornerShape(16.dp)),
                                contentScale = ContentScale.Crop,
                                showsFailureIcon = false
                            )
                        } else {
                            Box(Modifier.size(66.dp).clip(RoundedCornerShape(16.dp)).background(Color.White))
                        }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(restaurant.name, fontSize = 16.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                restaurant.cuisine?.replaceFirstChar { it.uppercase() } ?: restaurant.city ?: "Restaurang",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = DeliveraTheme.muted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        Box(
                            Modifier.size(38.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f))
                                .clickable { onToggleFavorite(restaurant) },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Filled.Favorite, null, tint = DeliveraTheme.orange, modifier = Modifier.size(15.dp))
                        }
                    }
                }
            }
        }
    }
}
