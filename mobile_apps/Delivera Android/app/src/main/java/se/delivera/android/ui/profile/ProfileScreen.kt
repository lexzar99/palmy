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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhoneIphone
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import se.delivera.android.data.AuthLauncher
import se.delivera.android.data.CustomerProfile
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.Prefs
import se.delivera.android.data.ProfileDeal
import se.delivera.android.data.ProfileOrder
import se.delivera.android.ui.components.Entrance
import se.delivera.android.ui.components.PanelHost
import se.delivera.android.ui.components.pressable
import se.delivera.android.ui.theme.DeliveraTheme
import kotlin.math.roundToInt

private enum class AuthStep { Phone, Code }

/** Sub-navigation inside the logged-in profile. Main is depth 0, panels depth 1. */
private enum class ProfilePanel { Main, Deals, Orders, Settings, Information }

@Composable
fun ProfileScreen(
    authToken: String,
    favoriteCount: Int,
    onOpenHome: () -> Unit
) {
    val api = remember { DeliveraApi() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var authStep by remember { mutableStateOf(AuthStep.Phone) }
    var phone by remember { mutableStateOf(Prefs.getString(Prefs.KEY_GUEST_PHONE, "")) }
    var pendingPhone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var authError by remember { mutableStateOf<String?>(null) }
    var profile by remember { mutableStateOf<CustomerProfile?>(null) }
    var orders by remember { mutableStateOf<List<ProfileOrder>>(emptyList()) }
    var deals by remember { mutableStateOf<List<ProfileDeal>>(emptyList()) }
    var panel by remember { mutableStateOf(ProfilePanel.Main) }
    val loggedIn = authToken.isNotBlank()
    val needsPhoneLink by Prefs.needsPhoneLinkState

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
            runCatching { api.profileOrders(authToken) }.onSuccess { orders = it }
            runCatching { api.profileDeals(authToken) }.onSuccess { deals = it }
        }
    }

    LaunchedEffect(authToken) {
        profile = null
        orders = emptyList()
        deals = emptyList()
        authError = null
        panel = ProfilePanel.Main
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
            }.onFailure { authError = it.message ?: "Kunde inte skicka kod." }
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
            }.onFailure { authError = it.message ?: "Koden stämde inte." }
            loading = false
        }
    }

    // OAuth-konton (Google/Apple) länkar sitt nummer: verifiera via OTP och
    // koppla numret till kontot med Supabase-token (link-phone kräver den).
    fun verifyLink() {
        if (pendingPhone.isBlank() || code.trim().length < 4) {
            authError = "Skriv koden du fick via SMS."
            return
        }
        scope.launch {
            loading = true
            authError = null
            runCatching {
                api.verifyPhoneOtp(pendingPhone, code.trim())
                api.linkPhone(pendingPhone, Prefs.oauthSupabaseTokenState.value.ifBlank { authToken })
            }.onSuccess {
                Prefs.needsPhoneLinkState.value = false
                authStep = AuthStep.Phone
                code = ""
                loadProfile()
            }.onFailure { authError = it.message ?: "Kunde inte länka numret." }
            loading = false
        }
    }

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        if (!loggedIn) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Entrance {
                        LoginCard(
                            step = authStep, phone = phone, pendingPhone = pendingPhone, code = code,
                            loading = loading, error = authError,
                            onPhoneChange = { phone = it },
                            onCodeChange = { code = it.filter(Char::isDigit).take(6) },
                            onSend = ::sendCode, onVerify = ::verifyCode,
                            onBack = { authStep = AuthStep.Phone; code = "" },
                            onSocial = { provider -> AuthLauncher.startOAuth(context, provider) }
                        )
                    }
                }
            }
        } else if (needsPhoneLink) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Entrance {
                        LinkPhoneCard(
                            step = authStep, phone = phone, pendingPhone = pendingPhone, code = code,
                            loading = loading, error = authError,
                            onPhoneChange = { phone = it },
                            onCodeChange = { code = it.filter(Char::isDigit).take(6) },
                            onSend = ::sendCode, onVerify = ::verifyLink,
                            onBack = { authStep = AuthStep.Phone; code = "" }
                        )
                    }
                }
            }
        } else {
            PanelHost(target = panel, depth = if (panel == ProfilePanel.Main) 0 else 1, modifier = Modifier.fillMaxSize()) { p ->
                when (p) {
                    ProfilePanel.Main -> ProfileMain(
                        profile = profile, ordersCount = orders.size, dealsCount = deals.size,
                        favoriteCount = favoriteCount, authError = authError,
                        onOpenDeals = { panel = ProfilePanel.Deals },
                        onOpenOrders = { panel = ProfilePanel.Orders },
                        onOpenSettings = { panel = ProfilePanel.Settings },
                        onOpenInformation = { panel = ProfilePanel.Information },
                        onLogout = { Prefs.authToken = ""; profile = null; orders = emptyList(); deals = emptyList(); panel = ProfilePanel.Main }
                    )
                    ProfilePanel.Deals -> DealsPanel(deals = deals, onBack = { panel = ProfilePanel.Main })
                    ProfilePanel.Orders -> OrdersPanel(orders = orders, onBack = { panel = ProfilePanel.Main })
                    ProfilePanel.Settings -> SettingsPanel(
                        profile = profile, onBack = { panel = ProfilePanel.Main },
                        onSave = { name, email, done ->
                            scope.launch {
                                runCatching { api.updateProfile(authToken, name, email) }
                                    .onSuccess { runCatching { profile = api.profile(authToken) }; done(true) }
                                    .onFailure { done(false) }
                            }
                        }
                    )
                    ProfilePanel.Information -> InformationPanel(onBack = { panel = ProfilePanel.Main })
                }
            }
        }
    }
}

/* ---------------- Main profile page ---------------- */

@Composable
private fun ProfileMain(
    profile: CustomerProfile?,
    ordersCount: Int,
    dealsCount: Int,
    favoriteCount: Int,
    authError: String?,
    onOpenDeals: () -> Unit,
    onOpenOrders: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenInformation: () -> Unit,
    onLogout: () -> Unit
) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { Entrance { ProfileHero(profile, onOpenSettings) } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                QuickTile("Deals", "$dealsCount redo", Icons.Filled.LocalOffer, Modifier.weight(1f), onOpenDeals)
                QuickTile("Historik", "$ordersCount ordrar", Icons.AutoMirrored.Filled.ReceiptLong, Modifier.weight(1f), onOpenOrders)
            }
        }
        item { ProfileRow(Icons.Filled.History, "Mina beställningar", "Kvitton och status", onOpenOrders) }
        item { ProfileRow(Icons.Filled.LocalOffer, "Mina deals", if (dealsCount > 0) "$dealsCount personliga rabatter" else "Personliga rabatter och uppdrag", onOpenDeals) }
        item { ProfileRow(Icons.Filled.Info, "Information", "Support, villkor och integritet", onOpenInformation) }
        item { ProfileRow(Icons.Filled.Settings, "Inställningar", profile?.phone ?: "Namn och kontakt", onOpenSettings) }
        authError?.let { item { Text(it, color = DeliveraTheme.orange, fontWeight = FontWeight.Bold, fontSize = 13.sp) } }
        item {
            Row(
                Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(16.dp)).background(Color.White)
                    .border(1.dp, DeliveraTheme.line, RoundedCornerShape(16.dp)).pressable(onClick = onLogout)
                    .padding(horizontal = 14.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.Logout, null, tint = destructiveRed, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text("Logga ut", fontSize = 15.sp, fontWeight = FontWeight.Black, color = destructiveRed)
            }
        }
    }
}

private val destructiveRed = Color(red = 0.86f, green = 0.20f, blue = 0.18f)

@Composable
private fun ProfileHero(profile: CustomerProfile?, onEdit: () -> Unit) {
    val hasPhone = !profile?.phone.isNullOrBlank()
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(DeliveraTheme.ink, Color(red = 0.22f, green = 0.10f, blue = 0.04f), DeliveraTheme.orange),
                    start = Offset(0f, 0f), end = Offset.Infinite
                )
            )
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(52.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Person, null, tint = Color.White, modifier = Modifier.size(26.dp))
            }
            Column(Modifier.weight(1f)) {
                Text("PROFIL", fontSize = 11.sp, fontWeight = FontWeight.Black, color = Color.White.copy(alpha = 0.62f))
                Text(profile?.displayName ?: "Din profil", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(profile?.phone ?: profile?.email ?: "Deals, Dpoints och historik sparas här.", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.80f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)).pressable(onClick = onEdit), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Edit, null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HeroChip(if (hasPhone) "Telefon klar" else "Lägg till nummer")
            HeroChip("Deals redo")
        }
    }
}

@Composable
private fun HeroChip(text: String) {
    Text(
        text, fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.White,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.18f)).padding(horizontal = 12.dp, vertical = 6.dp)
    )
}

@Composable
private fun QuickTile(title: String, value: String, icon: ImageVector, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).pressable(onClick = onClick).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = DeliveraTheme.orange, modifier = Modifier.size(18.dp))
        }
        Text(title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
    }
}

/* ---------------- Panels ---------------- */

@Composable
private fun PanelScaffold(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(start = 12.dp, end = 20.dp, top = 18.dp, bottom = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.size(40.dp).clip(CircleShape).pressable(onClick = onBack), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = DeliveraTheme.ink, modifier = Modifier.size(22.dp))
            }
            Text(title, fontSize = 22.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        }
        content()
    }
}

@Composable
private fun DealsPanel(deals: List<ProfileDeal>, onBack: () -> Unit) {
    var appliedId by remember { mutableStateOf(Prefs.getString(Prefs.KEY_ACTIVE_USER_DEAL_ID, "")) }
    PanelScaffold("Mina deals", onBack) {
        if (deals.isEmpty()) {
            EmptyPanel("Inga personliga deals ännu.", "Hämta deals på hemskärmen eller värva en vän.")
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 116.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(deals, key = { it.id }) { deal ->
                    val active = deal.userDealId != null && deal.userDealId == appliedId
                    Entrance {
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(DeliveraTheme.dealBlueGradient).padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(deal.title, fontSize = 17.sp, fontWeight = FontWeight.Black, color = Color.White)
                            Text(deal.subtitle, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.85f))
                            Row(
                                Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp))
                                    .background(if (active) Color.White.copy(alpha = 0.25f) else Color.White)
                                    .pressable(enabled = deal.userDealId != null && !active) {
                                        deal.userDealId?.let {
                                            Prefs.setString(Prefs.KEY_ACTIVE_USER_DEAL_ID, it)
                                            appliedId = it
                                        }
                                    },
                                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (active) Icon(Icons.Filled.CheckCircle, null, tint = Color.White, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    if (active) "Aktiv i kassan" else "Använd i kassan",
                                    fontSize = 14.sp, fontWeight = FontWeight.Black,
                                    color = if (active) Color.White else DeliveraTheme.dealBlueDeep
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OrdersPanel(orders: List<ProfileOrder>, onBack: () -> Unit) {
    PanelScaffold("Mina beställningar", onBack) {
        if (orders.isEmpty()) {
            EmptyPanel("Inga beställningar ännu.", "Dina kvitton och statusar dyker upp här.")
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 116.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(orders, key = { it.id }) { order -> Entrance { OrderCard(order) } }
            }
        }
    }
}

@Composable
private fun OrderCard(order: ProfileOrder) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ReceiptLong, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(order.restaurantName ?: "Order", fontSize = 16.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(orderStatusLabel(order.status), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = statusColor(order.status))
            }
            Text("${order.total.roundToInt()} kr", fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        }
        val itemLine = order.items.take(3).mapNotNull { it.productName }.joinToString(", ")
        if (itemLine.isNotBlank()) {
            Text(itemLine, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun SettingsPanel(
    profile: CustomerProfile?,
    onBack: () -> Unit,
    onSave: (name: String, email: String, done: (Boolean) -> Unit) -> Unit
) {
    var name by remember(profile) { mutableStateOf(profile?.displayName?.takeIf { it != "Kund" } ?: "") }
    var email by remember(profile) { mutableStateOf(profile?.email ?: "") }
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    PanelScaffold("Inställningar", onBack) {
        Column(
            Modifier.fillMaxSize().padding(start = 20.dp, end = 20.dp, top = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            OutlinedTextField(value = name, onValueChange = { name = it; saved = false }, label = { Text("Namn") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = email, onValueChange = { email = it; saved = false }, label = { Text("E-post (frivilligt)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).border(1.dp, DeliveraTheme.line, RoundedCornerShape(16.dp)).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text("Telefon", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
                Text(profile?.phone ?: "Ej satt", fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
            }
            PrimaryButton(
                if (saving) "Sparar..." else if (saved) "Sparat" else "Spara", enabled = !saving && name.isNotBlank()
            ) {
                saving = true; saved = false
                onSave(name.trim(), email.trim()) { ok -> saving = false; saved = ok }
            }
        }
    }
}

@Composable
private fun InformationPanel(onBack: () -> Unit) {
    PanelScaffold("Information", onBack) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 116.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item { InfoRow("Support", "Hör av dig om du behöver hjälp") }
            item { InfoRow("Villkor", "Användarvillkor för Delivera") }
            item { InfoRow("Integritet", "Så hanterar vi dina uppgifter") }
        }
    }
}

@Composable
private fun InfoRow(title: String, subtitle: String) {
    Row(
        Modifier.fillMaxWidth().height(64.dp).clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
            Text(subtitle, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        }
        Icon(Icons.Filled.ChevronRight, null, tint = DeliveraTheme.muted, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun EmptyPanel(title: String, subtitle: String) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Spacer(Modifier.height(40.dp))
        Text(title, fontSize = 17.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, textAlign = TextAlign.Center)
        Text(subtitle, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, textAlign = TextAlign.Center)
    }
}

/* ---------------- Shared bits ---------------- */

private fun orderStatusLabel(status: String): String = when (status.uppercase()) {
    "PENDING" -> "Väntar"
    "ACCEPTED", "PREPARING" -> "Tillagas"
    "READY" -> "Redo"
    "DELIVERING", "OUT_FOR_DELIVERY" -> "På väg"
    "DELIVERED", "COMPLETED" -> "Levererad"
    "CANCELLED", "CANCELED", "REJECTED" -> "Avbruten"
    else -> status.lowercase().replaceFirstChar { it.uppercase() }
}

private fun statusColor(status: String): Color = when (status.uppercase()) {
    "DELIVERED", "COMPLETED" -> Color(red = 0.13f, green = 0.55f, blue = 0.30f)
    "CANCELLED", "CANCELED", "REJECTED" -> destructiveRed
    else -> DeliveraTheme.muted
}

@Composable
private fun LoginCard(
    step: AuthStep, phone: String, pendingPhone: String, code: String,
    loading: Boolean, error: String?,
    onPhoneChange: (String) -> Unit, onCodeChange: (String) -> Unit,
    onSend: () -> Unit, onVerify: () -> Unit, onBack: () -> Unit,
    onSocial: (String) -> Unit
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
            fontSize = 14.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, textAlign = TextAlign.Center
        )
        if (step == AuthStep.Phone) {
            OutlinedTextField(value = phone, onValueChange = onPhoneChange, label = { Text("Telefonnummer") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
            PrimaryButton(if (loading) "Skickar..." else "Skicka kod", enabled = !loading, onClick = onSend)
            AuthDivider()
            SocialButton("Fortsätt med Apple", Color(0xFF141416), Color.White) { onSocial("apple") }
            SocialButton("Fortsätt med Google", Color.White, DeliveraTheme.ink, bordered = true) { onSocial("google") }
        } else {
            OutlinedTextField(value = code, onValueChange = onCodeChange, label = { Text("Kod") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
            PrimaryButton(if (loading) "Loggar in..." else "Logga in", enabled = !loading, onClick = onVerify)
            Text("Byt nummer", fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange, modifier = Modifier.clickable { onBack() })
        }
        error?.let { Text(it, fontSize = 12.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange, textAlign = TextAlign.Center) }
    }
}

@Composable
private fun AuthDivider() {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.weight(1f).height(1.dp).background(DeliveraTheme.line))
        Text("eller", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        Box(Modifier.weight(1f).height(1.dp).background(DeliveraTheme.line))
    }
}

@Composable
private fun SocialButton(label: String, bg: Color, fg: Color, bordered: Boolean = false, onClick: () -> Unit) {
    val base = Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(14.dp)).background(bg)
    val styled = if (bordered) base.border(1.dp, DeliveraTheme.line, RoundedCornerShape(14.dp)) else base
    Box(styled.pressable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(label, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = fg)
    }
}

/** Visas för OAuth-konton (Google/Apple) som ännu inte har ett verifierat nummer. */
@Composable
private fun LinkPhoneCard(
    step: AuthStep, phone: String, pendingPhone: String, code: String,
    loading: Boolean, error: String?,
    onPhoneChange: (String) -> Unit, onCodeChange: (String) -> Unit,
    onSend: () -> Unit, onVerify: () -> Unit, onBack: () -> Unit
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
        Text("Länka ditt nummer", fontSize = 28.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, textAlign = TextAlign.Center)
        Text(
            if (step == AuthStep.Phone) "Ett sista steg. Vi behöver ditt mobilnummer för leverans och kvitton." else "Vi skickade en kod till $pendingPhone.",
            fontSize = 14.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, textAlign = TextAlign.Center
        )
        if (step == AuthStep.Phone) {
            OutlinedTextField(value = phone, onValueChange = onPhoneChange, label = { Text("Telefonnummer") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
            PrimaryButton(if (loading) "Skickar..." else "Skicka kod", enabled = !loading, onClick = onSend)
        } else {
            OutlinedTextField(value = code, onValueChange = onCodeChange, label = { Text("Kod") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
            PrimaryButton(if (loading) "Länkar..." else "Länka nummer", enabled = !loading, onClick = onVerify)
            Text("Byt nummer", fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange, modifier = Modifier.clickable { onBack() })
        }
        error?.let { Text(it, fontSize = 12.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange, textAlign = TextAlign.Center) }
    }
}

@Composable
private fun PrimaryButton(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Text(
        label, fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp))
            .background(if (enabled) DeliveraTheme.orange else DeliveraTheme.muted)
            .pressable(enabled = enabled, onClick = onClick)
            .padding(top = 15.dp)
    )
}

@Composable
private fun ProfileRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(68.dp).clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).pressable(onClick = onClick).padding(horizontal = 14.dp),
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
