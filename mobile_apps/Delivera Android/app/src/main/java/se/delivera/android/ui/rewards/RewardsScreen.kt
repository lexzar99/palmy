package se.delivera.android.ui.rewards

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
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalOffer
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import se.delivera.android.data.DeliveraApi
import se.delivera.android.data.DpointsMe
import se.delivera.android.data.HomeAppDeal
import se.delivera.android.ui.theme.DeliveraTheme

@Composable
fun RewardsScreen(
    authToken: String,
    onOpenProfile: () -> Unit,
    onClaimedDeal: (HomeAppDeal) -> Unit
) {
    val api = remember { DeliveraApi() }
    val scope = rememberCoroutineScope()
    val isLoggedIn = authToken.isNotBlank()
    var me by remember { mutableStateOf<DpointsMe?>(null) }
    var missions by remember { mutableStateOf<List<HomeAppDeal>>(emptyList()) }
    var claimingId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            runCatching { api.dpointsMe() }.onSuccess { me = it }
            runCatching { api.appDeals("REWARDS", 12, isLoggedIn, authToken.ifBlank { null }) }
                .onSuccess { missions = it.deals; error = null }
                .onFailure { error = it.message }
        }
    }

    LaunchedEffect(authToken) { load() }

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
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

            item {
                RewardsHero(balance = me?.balance, isLoggedIn = isLoggedIn, onOpenProfile = onOpenProfile)
            }

            error?.let { item { Text(it, color = DeliveraTheme.orange, fontWeight = FontWeight.Bold) } }

            if (!isLoggedIn) {
                item {
                    Text(
                        "Logga in",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        modifier = Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp))
                            .background(DeliveraTheme.orange).clickable { onOpenProfile() }.padding(top = 15.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }

            item {
                Text("Uppdrag och deals", fontSize = 22.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
            }

            if (missions.isEmpty()) {
                item { EmptyRewardsCard() }
            } else {
                items(missions, key = { it.id }) { deal ->
                    MissionCard(
                        deal = deal,
                        isLoggedIn = isLoggedIn,
                        isClaiming = claimingId == deal.id,
                        onOpenProfile = onOpenProfile,
                        onClaim = {
                            if (!isLoggedIn) {
                                onOpenProfile()
                                return@MissionCard
                            }
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
    }
}

@Composable
private fun RewardsHero(balance: Int?, isLoggedIn: Boolean, onOpenProfile: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(DeliveraTheme.dealBlue)
            .clickable(enabled = !isLoggedIn) { onOpenProfile() }.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(48.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Stars, null, tint = Color.White, modifier = Modifier.size(25.dp))
            }
            Column {
                Text(if (isLoggedIn) "${balance ?: 0} Dpoints" else "Dpoints väntar", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Color.White)
                Text("10 poäng = 1 kr", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.82f))
            }
        }
    }
}

@Composable
private fun EmptyRewardsCard() {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.CardGiftcard, null, tint = DeliveraTheme.orange, modifier = Modifier.size(22.dp))
        Text("Inga rewards just nu.", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
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
