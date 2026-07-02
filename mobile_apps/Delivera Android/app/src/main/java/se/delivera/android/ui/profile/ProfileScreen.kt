package se.delivera.android.ui.profile

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhoneIphone
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Settings
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import se.delivera.android.data.CustomerProfile
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.Prefs
import se.delivera.android.data.ProfileOrder
import se.delivera.android.ui.components.Entrance
import se.delivera.android.ui.theme.DeliveraTheme
import kotlin.math.roundToInt

private enum class AuthStep { Phone, Code }

@Composable
fun ProfileScreen(
    authToken: String,
    favoriteCount: Int,
    onOpenHome: () -> Unit
) {
    val api = remember { DeliveraApi() }
    val scope = rememberCoroutineScope()
    var authStep by remember { mutableStateOf(AuthStep.Phone) }
    var phone by remember { mutableStateOf(Prefs.getString(Prefs.KEY_GUEST_PHONE, "")) }
    var pendingPhone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var authError by remember { mutableStateOf<String?>(null) }
    var profile by remember { mutableStateOf<CustomerProfile?>(null) }
    var orders by remember { mutableStateOf<List<ProfileOrder>>(emptyList()) }
    val loggedIn = authToken.isNotBlank()

    fun normalizeSwedishPhone(raw: String): String? {
        val digits = raw.filter { it.isDigit() }
        val normalized = when {
            raw.trim().startsWith("+") -> "+$digits"
            digits.startsWith("46") -> "+$digits"
            digits.startsWith("0") -> "+46${digits.drop(1)}"
            digits.length >= 7 -> "+46$digits"
            else -> ""
        }
        return normalized.takeIf { it.length in 10..14 }
    }

    fun loadProfile() {
        if (!loggedIn) return
        scope.launch {
            runCatching { api.profile(authToken) }
                .onSuccess { profile = it }
                .onFailure {
                    authError = "Kunde inte hämta profilen."
                    if (it.message?.contains("401") == true) Prefs.authToken = ""
                }
            runCatching { api.profileOrders(authToken) }
                .onSuccess { orders = it }
        }
    }

    LaunchedEffect(authToken) {
        profile = null
        orders = emptyList()
        authError = null
        if (authToken.isNotBlank()) loadProfile()
    }

    fun sendCode() {
        val normalized = normalizeSwedishPhone(phone)
        if (normalized == null) {
            authError = "Skriv ett giltigt svenskt mobilnummer."
            return
        }
        scope.launch {
            loading = true
            authError = null
            runCatching {
                runCatching { api.lookupPhone(normalized) }
                api.sendPhoneOtp(normalized)
            }.onSuccess {
                pendingPhone = normalized
                Prefs.setString(Prefs.KEY_GUEST_PHONE, normalized)
                authStep = AuthStep.Code
            }.onFailure {
                authError = it.message ?: "Kunde inte skicka kod."
            }
            loading = false
        }
    }

    fun verifyCode() {
        if (pendingPhone.isBlank() || code.trim().length < 4) {
            authError = "Skriv koden du fick via SMS."
            return
        }
        scope.launch {
            loading = true
            authError = null
            runCatching {
                val session = api.verifyPhoneOtp(pendingPhone, code.trim())
                api.exchangePhoneToken(session.accessToken)
            }.onSuccess {
                Prefs.authToken = it.token
                profile = it.user
                authStep = AuthStep.Phone
                code = ""
            }.onFailure {
                authError = it.message ?: "Koden stämde inte."
            }
            loading = false
        }
    }

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (!loggedIn) {
                item {
                    Entrance {
                        LoginCard(
                            step = authStep,
                            phone = phone,
                            pendingPhone = pendingPhone,
                            code = code,
                            loading = loading,
                            error = authError,
                            onPhoneChange = { phone = it },
                            onCodeChange = { code = it.filter(Char::isDigit).take(6) },
                            onSend = ::sendCode,
                            onVerify = ::verifyCode,
                            onBack = { authStep = AuthStep.Phone; code = "" }
                        )
                    }
                }
            } else {
                item { Entrance { ProfileHero(profile) } }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatCard("Favoriter", "$favoriteCount", Modifier.weight(1f))
                        StatCard("Ordrar", "${orders.size}", Modifier.weight(1f))
                    }
                }
                item { ProfileRow(Icons.Filled.History, "Mina beställningar", "Kvitton och status", onOpenHome) }
                item { ProfileRow(Icons.Filled.LocalOffer, "Mina deals", "Personliga rabatter och uppdrag", onOpenHome) }
                item { ProfileRow(Icons.Filled.Favorite, "Favoriter", "$favoriteCount sparade ställen", onOpenHome) }
                item { ProfileRow(Icons.Filled.Settings, "Inställningar", profile?.phone ?: "Telefon klar") {} }
                authError?.let { item { Text(it, color = DeliveraTheme.orange, fontWeight = FontWeight.Bold) } }
                if (orders.isNotEmpty()) {
                    item { SectionTitle("Senaste beställningar") }
                    items(orders.take(4), key = { it.id }) { order -> OrderRow(order) }
                }
                item {
                    Row(
                        Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(16.dp)).background(Color.White)
                            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(16.dp)).clickable {
                                Prefs.authToken = ""
                                profile = null
                                orders = emptyList()
                            }.padding(horizontal = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.Logout, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
                        Text("Logga ut", fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
                    }
                }
            }
        }
    }
}

@Composable
private fun LoginCard(
    step: AuthStep,
    phone: String,
    pendingPhone: String,
    code: String,
    loading: Boolean,
    error: String?,
    onPhoneChange: (String) -> Unit,
    onCodeChange: (String) -> Unit,
    onSend: () -> Unit,
    onVerify: () -> Unit,
    onBack: () -> Unit
) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(26.dp)).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(Modifier.size(58.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.PhoneIphone, null, tint = DeliveraTheme.orange, modifier = Modifier.size(28.dp))
        }
        Text("Logga in", fontSize = 32.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text(
            if (step == AuthStep.Phone) "Vi skickar en engångskod till ditt nummer." else "Vi skickade en kod till $pendingPhone.",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = DeliveraTheme.muted,
            textAlign = TextAlign.Center
        )
        if (step == AuthStep.Phone) {
            OutlinedTextField(
                value = phone,
                onValueChange = onPhoneChange,
                label = { Text("Telefonnummer") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth()
            )
            PrimaryButton(if (loading) "Skickar..." else "Skicka kod", enabled = !loading, onClick = onSend)
        } else {
            OutlinedTextField(
                value = code,
                onValueChange = onCodeChange,
                label = { Text("Kod") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )
            PrimaryButton(if (loading) "Loggar in..." else "Logga in", enabled = !loading, onClick = onVerify)
            Text("Byt nummer", fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange, modifier = Modifier.clickable { onBack() })
        }
        error?.let { Text(it, fontSize = 12.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange, textAlign = TextAlign.Center) }
    }
}

@Composable
private fun ProfileHero(profile: CustomerProfile?) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(24.dp)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(52.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Person, null, tint = DeliveraTheme.orange, modifier = Modifier.size(25.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(profile?.displayName ?: "Din profil", fontSize = 24.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(profile?.phone ?: profile?.email ?: "Deals, Dpoints och historik sparas här.", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
            }
        }
    }
}

@Composable
private fun StatCard(title: String, value: String, modifier: Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(value, fontSize = 23.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text(title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
    }
}

@Composable
private fun OrderRow(order: ProfileOrder) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.ReceiptLong, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(order.restaurantName ?: "Order", fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(order.status.lowercase().replaceFirstChar { it.uppercase() }, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        }
        Text("${order.total.roundToInt()} kr", fontSize = 14.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(title, fontSize = 18.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
}

@Composable
private fun PrimaryButton(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 15.sp,
        fontWeight = FontWeight.Black,
        color = Color.White,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp))
            .background(if (enabled) DeliveraTheme.orange else DeliveraTheme.muted)
            .clickable(enabled = enabled) { onClick() }
            .padding(top = 15.dp)
    )
}

@Composable
private fun ProfileRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(68.dp).clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).clickable { onClick() }.padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = DeliveraTheme.orange, modifier = Modifier.size(19.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
            Text(subtitle, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icons.Filled.ChevronRight, null, tint = DeliveraTheme.muted, modifier = Modifier.size(20.dp))
    }
}
