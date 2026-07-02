package se.delivera.android.ui.rewards

import android.content.Intent
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
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.DpointsEarnRule
import se.delivera.android.data.DpointsMe
import se.delivera.android.data.DpointsReward
import se.delivera.android.data.HomeAppDeal
import se.delivera.android.data.ReferralStatusResponse
import se.delivera.android.ui.components.Entrance
import se.delivera.android.ui.theme.DeliveraTheme

@Composable
fun RewardsScreen(
    authToken: String,
    onOpenProfile: () -> Unit,
    onClaimedDeal: (HomeAppDeal) -> Unit
) {
    val api = remember { DeliveraApi() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val isLoggedIn = authToken.isNotBlank()
    var me by remember { mutableStateOf<DpointsMe?>(null) }
    var rewards by remember { mutableStateOf<List<DpointsReward>>(emptyList()) }
    var earnRules by remember { mutableStateOf<List<DpointsEarnRule>>(emptyList()) }
    var missions by remember { mutableStateOf<List<HomeAppDeal>>(emptyList()) }
    var referral by remember { mutableStateOf<ReferralStatusResponse?>(null) }
    var selectedPanel by remember { mutableStateOf(RewardsPanel.Shop) }
    var claimingId by remember { mutableStateOf<String?>(null) }
    var isClaimingSignup by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            runCatching { api.dpointsRewards() }
                .onSuccess { response ->
                    rewards = response.rewards
                    earnRules = response.earnRules
                }
            if (isLoggedIn) {
                runCatching { api.dpointsMe(authToken) }
                    .onSuccess { me = it }
                    .onFailure { error = it.message }
                runCatching { api.referralStatus(authToken) }
                    .onSuccess { referral = it }
            } else {
                me = null
                referral = null
            }
            runCatching { api.appDeals("REWARDS", 12, isLoggedIn, authToken.ifBlank { null }) }
                .onSuccess { missions = it.deals; error = null }
                .onFailure { error = it.message }
        }
    }

    LaunchedEffect(authToken) { load() }

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Entrance(delayMillis = 0) {
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text("Rewards", fontSize = 34.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                        Text(
                            if (isLoggedIn) "Tjäna poäng, starta uppdrag och använd dina rewards." else "Logga in för att spara Dpoints och deals.",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = DeliveraTheme.muted
                        )
                    }
                }
            }

            if (!isLoggedIn) {
                item {
                    Entrance(delayMillis = 40) {
                        GuestRewardsHero(onOpenProfile)
                    }
                }
                item {
                    Entrance(delayMillis = 80) {
                        GuestPerks()
                    }
                }
            } else {
                me?.signup?.takeIf { it.claimable }?.let { signup ->
                    item {
                        Entrance(delayMillis = 40) {
                            SignupBonusCard(
                                points = signup.bonusPoints,
                                isClaiming = isClaimingSignup,
                                onClaim = {
                                    scope.launch {
                                        isClaimingSignup = true
                                        runCatching { api.claimSignupBonus(authToken) }
                                            .onSuccess { response ->
                                                me = me?.copy(balance = response.balance, signup = me?.signup?.copy(claimable = false))
                                            }
                                            .onFailure { error = it.message }
                                        isClaimingSignup = false
                                    }
                                }
                            )
                        }
                    }
                }
                item {
                    Entrance(delayMillis = 70) {
                        RewardsHero(balance = me?.balance, loading = me == null, onOpenProfile = onOpenProfile)
                    }
                }
                referral?.takeIf { it.enabled }?.let { ref ->
                    item {
                        Entrance(delayMillis = 85) {
                            ReferralInviteCard(
                                referral = ref,
                                onShare = {
                                    val url = ref.shareUrl.orEmpty()
                                    val reward = ref.rewardLabel ?: ref.deal?.title ?: "en belöning"
                                    val message = if (url.isNotBlank()) {
                                        "Häng med mig på Delivera. Vi får båda $reward. $url"
                                    } else {
                                        "Använd min Delivera-kod ${ref.code.orEmpty()} så får vi båda $reward."
                                    }
                                    val intent = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_TEXT, message)
                                    }
                                    context.startActivity(Intent.createChooser(intent, "Dela Delivera"))
                                }
                            )
                        }
                    }
                }
                item {
                    Entrance(delayMillis = 100) {
                        PanelPicker(selectedPanel = selectedPanel, onSelect = { selectedPanel = it })
                    }
                }
            }

            error?.let { item { Text(it, color = DeliveraTheme.orange, fontWeight = FontWeight.Bold) } }

            when {
                !isLoggedIn -> {
                    item { SectionTitle("Köp med poäng", "Se vad du kan låsa upp när du loggar in.") }
                    if (rewards.isEmpty()) {
                        item { EmptyRewardsCard("Rewards fylls på snart.") }
                    } else {
                        items(rewards, key = { "locked-${it.id}" }) { reward ->
                            RewardCard(reward = reward, locked = true, onOpenProfile = onOpenProfile)
                        }
                    }
                }
                selectedPanel == RewardsPanel.Shop -> {
                    item { SectionTitle("Köp med poäng", "Använd poäng på markerade rewards.") }
                    if (rewards.isEmpty()) {
                        item { EmptyRewardsCard("Inga rewards just nu.") }
                    } else {
                        items(rewards, key = { it.id }) { reward ->
                            RewardCard(reward = reward, locked = false, onOpenProfile = onOpenProfile)
                        }
                    }
                    item { SectionTitle("Uppdrag och deals", "Starta dealen och använd den i kassan.") }
                    if (missions.isEmpty()) {
                        item { EmptyRewardsCard("Inga uppdrag just nu.") }
                    } else {
                        items(missions, key = { "mission-${it.id}" }) { deal ->
                            MissionCard(
                                deal = deal,
                                isLoggedIn = isLoggedIn,
                                isClaiming = claimingId == deal.id,
                                onOpenProfile = onOpenProfile,
                                onClaim = {
                                    scope.launch {
                                        claimingId = deal.id
                                        try {
                                            val response = api.claimHomeAppDeal(deal.id, authToken)
                                            response.deal?.let { updated ->
                                                missions = missions.map { if (it.id == updated.id) updated else it }
                                                onClaimedDeal(updated)
                                            }
                                        } finally {
                                            claimingId = null
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
                selectedPanel == RewardsPanel.Earn -> {
                    item { SectionTitle("Tjäna Dpoints", "Allt räknas från servern.") }
                    if (earnRules.isEmpty()) {
                        item { EmptyRewardsCard("Inga intjäningsregler just nu.") }
                    } else {
                        items(earnRules, key = { it.key }) { rule -> EarnRuleCard(rule) }
                    }
                }
                selectedPanel == RewardsPanel.History -> {
                    item { SectionTitle("Historik", "Dina senaste Dpoints-rörelser.") }
                    val transactions = me?.transactions.orEmpty()
                    if (transactions.isEmpty()) {
                        item { EmptyRewardsCard("Historik visas här efter din första order.") }
                    } else {
                        items(transactions, key = { it.id }) { tx ->
                            HistoryRow(title = tx.reason ?: tx.type ?: "Dpoints", amount = tx.amount, balance = tx.balanceAfter)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReferralInviteCard(referral: ReferralStatusResponse, onShare: () -> Unit) {
    val reward = referral.rewardLabel ?: referral.deal?.title ?: "en belöning"
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(46.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.PersonAdd, null, tint = DeliveraTheme.orange, modifier = Modifier.size(22.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(if (referral.locked) "Värva vän låses upp efter första ordern" else "Värva vän", fontSize = 16.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                Text(if (referral.locked) "Beställ en gång för att få din kod." else "Ni får båda $reward.", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
            }
        }
        if (!referral.locked) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    referral.code ?: "DIN KOD",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Black,
                    color = DeliveraTheme.ink,
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.Black.copy(alpha = 0.045f)).padding(horizontal = 14.dp, vertical = 12.dp)
                )
                Row(
                    Modifier.clip(RoundedCornerShape(14.dp)).background(DeliveraTheme.ink).clickable { onShare() }.padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Filled.Share, null, tint = Color.White, modifier = Modifier.size(16.dp))
                    Text("Dela", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White)
                }
            }
            referral.stats?.let { stats ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ReferralStat("${stats.invited}", "inbjudna", Modifier.weight(1f))
                    ReferralStat("${stats.registered}", "registrerade", Modifier.weight(1f))
                    ReferralStat("${stats.ordered}", "beställt", Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun ReferralStat(value: String, label: String, modifier: Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(14.dp)).background(Color.Black.copy(alpha = 0.04f)).padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value, fontSize = 16.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, maxLines = 1)
    }
}

@Composable
private fun GuestRewardsHero(onOpenProfile: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(DeliveraTheme.dealBlue)
            .clickable { onOpenProfile() }.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(Icons.Filled.Stars, null, tint = Color.White, modifier = Modifier.size(30.dp))
        Text("Dpoints väntar", fontSize = 28.sp, fontWeight = FontWeight.Black, color = Color.White)
        Text("Logga in och samla poäng på varje order.", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.84f))
        Text(
            "Logga in",
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            color = DeliveraTheme.dealBlueInk,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White).padding(horizontal = 14.dp, vertical = 9.dp)
        )
    }
}

@Composable
private fun GuestPerks() {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SmallPerk("Deals", "Spara favoriter", Modifier.weight(1f))
        SmallPerk("Uppdrag", "Få bonusar", Modifier.weight(1f))
    }
}

@Composable
private fun SmallPerk(title: String, subtitle: String, modifier: Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text(subtitle, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
    }
}

@Composable
private fun SignupBonusCard(points: Int, isClaiming: Boolean, onClaim: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color(0xFF2B7D4F))
            .clickable(enabled = !isClaiming) { onClaim() }.padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.17f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Stars, null, tint = Color.White, modifier = Modifier.size(22.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Hämta din välkomstbonus", fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White)
            Text("+$points Dpoints väntar på dig", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.78f))
        }
        Text(if (isClaiming) "..." else "Hämta", fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.White)
    }
}

@Composable
private fun RewardsHero(balance: Int?, loading: Boolean, onOpenProfile: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(DeliveraTheme.dealBlue)
            .clickable(enabled = balance == null && !loading) { onOpenProfile() }.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(48.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Stars, null, tint = Color.White, modifier = Modifier.size(25.dp))
            }
            Column {
                Text(if (loading) "Hämtar Dpoints" else "${balance ?: 0} Dpoints", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Color.White)
                Text("10 poäng = 1 kr", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.82f))
            }
        }
    }
}

@Composable
private fun PanelPicker(selectedPanel: RewardsPanel, onSelect: (RewardsPanel) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        RewardsPanel.entries.forEach { panel ->
            val selected = selectedPanel == panel
            Row(
                Modifier.weight(1f).height(46.dp).clip(RoundedCornerShape(15.dp))
                    .background(if (selected) DeliveraTheme.ink else Color.White)
                    .border(1.dp, DeliveraTheme.line, RoundedCornerShape(15.dp))
                    .clickable { onSelect(panel) }
                    .padding(horizontal = 10.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(panel.icon, null, tint = if (selected) Color.White else DeliveraTheme.ink, modifier = Modifier.size(16.dp))
                Spacer(Modifier.size(7.dp))
                Text(panel.title, fontSize = 12.sp, fontWeight = FontWeight.Black, color = if (selected) Color.White else DeliveraTheme.ink)
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(title, fontSize = 21.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        Text(subtitle, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
    }
}

@Composable
private fun RewardCard(reward: DpointsReward, locked: Boolean, onOpenProfile: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp))
            .clickable(enabled = locked) { onOpenProfile() }
            .padding(15.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(if (locked) Icons.Filled.Lock else Icons.Filled.CardGiftcard, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(reward.title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(reward.description ?: rewardSubtitle(reward), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text(
            if (locked) "Lås upp" else "${reward.pointsCost} p",
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            textAlign = TextAlign.Center,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(DeliveraTheme.ink).padding(horizontal = 12.dp, vertical = 8.dp)
        )
    }
}

@Composable
private fun EarnRuleCard(rule: DpointsEarnRule) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(15.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Stars, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(rule.label, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(rule.repeat ?: "Aktiv regel", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text("+${rule.points}", fontSize = 13.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
    }
}

@Composable
private fun MissionCard(
    deal: HomeAppDeal,
    isLoggedIn: Boolean,
    isClaiming: Boolean,
    onOpenProfile: () -> Unit,
    onClaim: () -> Unit
) {
    val progress = deal.missionProgress
    val claimed = !deal.userDealId.isNullOrBlank()
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).clickable { if (isLoggedIn) onClaim() else onOpenProfile() }
            .padding(15.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(if (claimed) Icons.Filled.CheckCircle else Icons.Filled.LocalOffer, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(deal.title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                progress?.let { if (claimed) "${it.count} av ${it.target}" else "+${it.rewardPoints} Dpoints" }
                    ?: deal.subtitle ?: deal.badge ?: "Personlig reward",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = DeliveraTheme.muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Text(
            when {
                isClaiming -> "..."
                claimed -> "Startad"
                else -> deal.ctaLabel ?: "Hämta"
            },
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(DeliveraTheme.ink).padding(horizontal = 12.dp, vertical = 8.dp)
        )
    }
}

@Composable
private fun HistoryRow(title: String, amount: Int, balance: Int?) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(15.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(balance?.let { "Saldo $it" } ?: "Dpoints", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        }
        Text(if (amount >= 0) "+$amount" else "$amount", fontSize = 14.sp, fontWeight = FontWeight.Black, color = if (amount >= 0) DeliveraTheme.orange else DeliveraTheme.muted)
    }
}

@Composable
private fun EmptyRewardsCard(text: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.CardGiftcard, null, tint = DeliveraTheme.orange, modifier = Modifier.size(22.dp))
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
    }
}

private fun rewardSubtitle(reward: DpointsReward): String {
    if (reward.freeDelivery == true) return "Fri leverans"
    return when (reward.discountType) {
        "PERCENTAGE" -> "${reward.discountValue ?: 0}% rabatt"
        "FIXED" -> "${reward.discountValue ?: 0} kr rabatt"
        else -> "${reward.pointsCost} Dpoints"
    }
}

private enum class RewardsPanel(val title: String, val icon: ImageVector) {
    Shop("Köp", Icons.Filled.ShoppingBag),
    Earn("Tjäna", Icons.Filled.Stars),
    History("Historik", Icons.Filled.History)
}
