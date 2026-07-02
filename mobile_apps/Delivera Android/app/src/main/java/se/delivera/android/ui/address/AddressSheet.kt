package se.delivera.android.ui.address

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DirectionsWalk
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import se.delivera.android.data.City
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.OrderMode
import se.delivera.android.data.PlacePrediction
import se.delivera.android.ui.theme.DeliveraTheme
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressSheet(
    deliveryAddress: String,
    deliveryCityName: String,
    pickupCityName: String,
    recentAddresses: List<String>,
    mode: OrderMode,
    cities: List<City>,
    onDismiss: () -> Unit,
    onConfirm: (
        mode: OrderMode,
        deliveryAddress: String,
        deliveryCityName: String,
        latitude: Double?,
        longitude: Double?,
        pickupCityName: String,
        recentAddresses: List<String>
    ) -> Unit
) {
    val api = remember { DeliveraApi() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var draftMode by remember { mutableStateOf(mode) }
    var draftAddress by remember { mutableStateOf(deliveryAddress) }
    var draftDeliveryCity by remember { mutableStateOf(deliveryCityName) }
    var draftPickupCity by remember { mutableStateOf(pickupCityName.ifBlank { deliveryCityName }) }
    var draftLat by remember { mutableStateOf<Double?>(null) }
    var draftLng by remember { mutableStateOf<Double?>(null) }
    var predictions by remember { mutableStateOf<List<PlacePrediction>>(emptyList()) }
    var sessionToken by remember { mutableStateOf(UUID.randomUUID().toString()) }
    var hasEditedAddress by remember { mutableStateOf(false) }
    var isResolving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var nextRecent by remember { mutableStateOf(rememberAddress(recentAddresses, deliveryAddress)) }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true || result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            scope.launch {
                resolveCurrentLocation(context, api) { address, city, lat, lng, message ->
                    if (message != null) error = message
                    if (address != null) {
                        draftAddress = address
                        draftDeliveryCity = city ?: draftDeliveryCity
                        draftPickupCity = draftDeliveryCity
                        draftLat = lat
                        draftLng = lng
                        nextRecent = rememberAddress(nextRecent, address)
                        predictions = emptyList()
                        hasEditedAddress = false
                    }
                    isResolving = false
                }
            }
        } else {
            error = "Kunde inte hämta platsen. Kontrollera platsbehörighet."
            isResolving = false
        }
    }

    LaunchedEffect(draftAddress, hasEditedAddress, draftMode, sessionToken) {
        val query = draftAddress.trim()
        if (draftMode != OrderMode.Delivery || !hasEditedAddress || query.length < 3) {
            predictions = emptyList()
            return@LaunchedEffect
        }
        delay(280)
        predictions = runCatching { api.autocompletePlaces(query, sessionToken) }.getOrDefault(emptyList())
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color.Transparent,
        dragHandle = null
    ) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .background(DeliveraTheme.appBackgroundBrush).padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Välj adress", fontSize = 29.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                    Text(
                        if (draftMode == OrderMode.Delivery) "Vi visar restauranger som kan leverera hit." else "Välj stad och hämta maten själv.",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = DeliveraTheme.muted
                    )
                }
                Box(Modifier.size(36.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.06f)).clickable { onDismiss() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, null, tint = DeliveraTheme.ink, modifier = Modifier.size(15.dp))
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ModeChip("Leverans", Icons.Filled.ElectricBolt, draftMode == OrderMode.Delivery, Modifier.weight(1f)) {
                    draftMode = OrderMode.Delivery
                }
                ModeChip("Avhämtning", Icons.Filled.DirectionsWalk, draftMode == OrderMode.Pickup, Modifier.weight(1f)) {
                    draftMode = OrderMode.Pickup
                    draftPickupCity = draftDeliveryCity.ifBlank { draftPickupCity.ifBlank { cities.firstOrNull()?.name.orEmpty() } }
                }
            }

            if (draftMode == OrderMode.Delivery) {
                DeliveryContent(
                    draftAddress = draftAddress,
                    predictions = predictions,
                    recentAddresses = nextRecent,
                    isResolving = isResolving,
                    error = error,
                    onAddressChange = {
                        draftAddress = it
                        hasEditedAddress = true
                    },
                    onPrediction = { prediction ->
                        scope.launch {
                            runCatching { api.geocodePlace(prediction.placeId, sessionToken) }
                                .onSuccess { geocode ->
                                    draftAddress = prediction.description
                                    draftDeliveryCity = geocode.city ?: draftDeliveryCity
                                    draftPickupCity = draftDeliveryCity
                                    draftLat = geocode.location.lat
                                    draftLng = geocode.location.lng
                                    nextRecent = rememberAddress(nextRecent, prediction.description)
                                    predictions = emptyList()
                                    hasEditedAddress = false
                                    sessionToken = UUID.randomUUID().toString()
                                    error = null
                                }
                                .onFailure { error = "Kunde inte välja adressen." }
                        }
                    },
                    onRecent = { address ->
                        draftAddress = address
                        nextRecent = rememberAddress(nextRecent, address)
                        predictions = emptyList()
                        hasEditedAddress = false
                    },
                    onCurrentLocation = {
                        isResolving = true
                        error = null
                        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        if (fine || coarse) {
                            scope.launch {
                                resolveCurrentLocation(context, api) { address, city, lat, lng, message ->
                                    if (message != null) error = message
                                    if (address != null) {
                                        draftAddress = address
                                        draftDeliveryCity = city ?: draftDeliveryCity
                                        draftPickupCity = draftDeliveryCity
                                        draftLat = lat
                                        draftLng = lng
                                        nextRecent = rememberAddress(nextRecent, address)
                                        predictions = emptyList()
                                        hasEditedAddress = false
                                    }
                                    isResolving = false
                                }
                            }
                        } else {
                            permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                        }
                    }
                )
            } else {
                PickupContent(cities = cities, selectedCityName = draftPickupCity) { draftPickupCity = it.name }
            }

            Button(
                onClick = {
                    val finalAddress = draftAddress.trim().ifEmpty { deliveryAddress }
                    onConfirm(
                        draftMode,
                        finalAddress,
                        draftDeliveryCity.ifBlank { deliveryCityName },
                        draftLat,
                        draftLng,
                        draftPickupCity.ifBlank { pickupCityName },
                        rememberAddress(nextRecent, finalAddress)
                    )
                    onDismiss()
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = DeliveraTheme.orange)
            ) {
                Text("Bekräfta", fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
        }
    }
}

@Composable
private fun DeliveryContent(
    draftAddress: String,
    predictions: List<PlacePrediction>,
    recentAddresses: List<String>,
    isResolving: Boolean,
    error: String?,
    onAddressChange: (String) -> Unit,
    onPrediction: (PlacePrediction) -> Unit,
    onRecent: (String) -> Unit,
    onCurrentLocation: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(16.dp)).background(Color.White)
                .border(1.dp, DeliveraTheme.line, RoundedCornerShape(16.dp)).padding(horizontal = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.LocationOn, null, tint = DeliveraTheme.orange, modifier = Modifier.size(18.dp))
            BasicTextField(
                value = draftAddress,
                onValueChange = onAddressChange,
                singleLine = true,
                textStyle = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.ink),
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    Box {
                        if (draftAddress.isEmpty()) Text("Gata, område eller stad", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
                        inner()
                    }
                }
            )
        }

        predictions.take(4).forEach { prediction ->
            SheetRow(Icons.Filled.Place, prediction.description, "Adress", DeliveraTheme.orange) { onPrediction(prediction) }
        }

        SheetRow(Icons.Filled.MyLocation, if (isResolving) "Hämtar plats..." else "Använd min position", "Hämta adress automatiskt", DeliveraTheme.orange, enabled = !isResolving, onClick = onCurrentLocation)

        if (recentAddresses.isNotEmpty()) {
            Text("Senast valda", fontSize = 12.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.muted)
            recentAddresses.take(3).forEach { address ->
                SheetRow(Icons.Filled.History, address, "Adress", DeliveraTheme.ink) { onRecent(address) }
            }
        }

        error?.let { Text(it, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.orange) }
    }
}

@Composable
private fun PickupContent(cities: List<City>, selectedCityName: String, onSelect: (City) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Tillgängliga städer", fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.muted)
        LazyVerticalGrid(columns = GridCells.Adaptive(128.dp), modifier = Modifier.height(180.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(cities, key = { it.id }) { city ->
                val selected = city.name.equals(selectedCityName, ignoreCase = true)
                Row(
                    Modifier.height(44.dp).clip(RoundedCornerShape(14.dp)).background(if (selected) DeliveraTheme.orange else Color.White)
                        .border(1.dp, DeliveraTheme.line, RoundedCornerShape(14.dp)).clickable { onSelect(city) }.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(city.name, fontSize = 14.sp, fontWeight = FontWeight.Black, color = if (selected) Color.White else DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (selected) Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(13.dp))
                }
            }
        }
    }
}

@Composable
private fun ModeChip(label: String, icon: ImageVector, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier.height(54.dp).clip(RoundedCornerShape(50)).background(if (selected) DeliveraTheme.ink else Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(50)).clickable { onClick() },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = if (selected) Color.White else DeliveraTheme.ink.copy(alpha = 0.62f), modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(7.dp))
        Text(label, fontSize = 15.sp, fontWeight = FontWeight.Black, color = if (selected) Color.White else DeliveraTheme.ink.copy(alpha = 0.62f))
    }
}

@Composable
private fun SheetRow(icon: ImageVector, title: String, subtitle: String, accent: Color, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(56.dp).clip(RoundedCornerShape(14.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(14.dp)).clickable(enabled = enabled) { onClick() }.padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(30.dp).clip(CircleShape).background(accent.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = accent, modifier = Modifier.size(15.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = DeliveraTheme.muted, maxLines = 1)
        }
    }
}

private suspend fun resolveCurrentLocation(
    context: Context,
    api: DeliveraApi,
    apply: (address: String?, city: String?, lat: Double?, lng: Double?, error: String?) -> Unit
) {
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
    val location = providers.firstNotNullOfOrNull { provider ->
        runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
    }
    if (location == null) {
        apply(null, null, null, null, "Kunde inte hitta en aktuell plats.")
        return
    }
    runCatching { api.reverseGeocode(location.latitude, location.longitude) }
        .onSuccess { reverse -> apply(reverse.address, reverse.city, location.latitude, location.longitude, null) }
        .onFailure { apply(null, null, null, null, "Kunde inte hämta adressen.") }
}

private fun rememberAddress(source: List<String>, address: String): List<String> {
    val trimmed = address.trim()
    if (trimmed.isEmpty()) return source.take(3)
    val next = source.filterNot { it.equals(trimmed, ignoreCase = true) }.toMutableList()
    next.add(0, trimmed)
    return next.take(3)
}
