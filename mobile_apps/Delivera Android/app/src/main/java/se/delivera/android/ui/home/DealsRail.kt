package se.delivera.android.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.HomeAppDeal
import se.delivera.android.data.HomeAppDealMissionProgress
import se.delivera.android.ui.theme.DeliveraTheme

sealed class DealCardAction {
    data class Claim(val deal: HomeAppDeal) : DealCardAction()
    data class Use(val deal: HomeAppDeal) : DealCardAction()
    data object LoginRequired : DealCardAction()
}

@Composable
fun DealsRail(
    deals: List<HomeAppDeal>,
    isLoggedIn: Boolean,
    activeUserDealId: String,
    claimingDealId: String?,
    onAction: (DealCardAction) -> Unit
) {
    if (deals.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader(title = "Dina erbjudanden", subtitle = "Utvalda för dig just nu")

        if (deals.size == 1) {
            DealCard(
                deal = deals.first(),
                isLoggedIn = isLoggedIn,
                isActive = deals.first().userDealId?.takeIf { it.isNotBlank() } == activeUserDealId,
                isClaiming = claimingDealId == deals.first().id,
                fullWidth = true,
                onAction = onAction
            )
        } else {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                items(deals, key = { it.id }) { deal ->
                    DealCard(
                        deal = deal,
                        isLoggedIn = isLoggedIn,
                        isActive = deal.userDealId?.takeIf { it.isNotBlank() } == activeUserDealId,
                        isClaiming = claimingDealId == deal.id,
                        fullWidth = false,
                        onAction = onAction
                    )
                }
            }
        }
    }
}

@Composable
fun DealCard(
    deal: HomeAppDeal,
    isLoggedIn: Boolean,
    isActive: Boolean,
    isClaiming: Boolean,
    fullWidth: Boolean,
    modifier: Modifier = Modifier,
    height: Int = 176,
    onAction: (DealCardAction) -> Unit
) {
    val isMission = !deal.missionType.isNullOrBlank()
    val isClaimed = !deal.userDealId.isNullOrBlank()
    val enabled = !isClaiming && !(isMission && isClaimed)

    Box(
        modifier = modifier
            .then(if (fullWidth) Modifier.fillMaxWidth() else Modifier.width(300.dp))
            .height(height.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(PulseThemes.gradient(deal.theme))
            .clickable(enabled = enabled) {
                when {
                    !isLoggedIn -> onAction(DealCardAction.LoginRequired)
                    isClaimed && !isMission -> onAction(DealCardAction.Use(deal))
                    !isClaimed -> onAction(DealCardAction.Claim(deal))
                }
            }
            .padding(16.dp)
    ) {
        Column(Modifier.fillMaxSize()) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    deal.badge?.takeIf { it.isNotBlank() }?.let { badge ->
                        DealChip(text = badge.uppercase(), theme = deal.theme, height = 22)
                    }

                    Text(
                        deal.title,
                        fontSize = 19.sp,
                        lineHeight = 21.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    deal.subtitle?.takeIf { it.isNotBlank() }?.let { subtitle ->
                        Text(
                            subtitle,
                            fontSize = 12.sp,
                            lineHeight = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White.copy(alpha = 0.85f),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                valueHeadline(deal)?.let { DealChip(text = it, theme = deal.theme, height = 30) }
            }

            Spacer(Modifier.weight(1f))

            if (isMission && isClaimed) {
                deal.missionProgress?.let {
                    MissionProgressBar(progress = it)
                    Spacer(Modifier.height(10.dp))
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                deal.restaurant?.let { restaurant ->
                    Row(
                        Modifier.weight(1f, fill = false),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.Storefront, null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(12.dp))
                        Text(
                            restaurant.name,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White.copy(alpha = 0.9f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Spacer(Modifier.weight(1f))

                Row(
                    Modifier.height(36.dp).clip(RoundedCornerShape(50)).background(Color.White).padding(horizontal = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    when {
                        isClaiming -> CircularProgressIndicator(
                            modifier = Modifier.size(14.dp),
                            strokeWidth = 2.dp,
                            color = PulseThemes.chipInk(deal.theme)
                        )
                        isActive -> Icon(Icons.Filled.CheckCircle, null, tint = PulseThemes.chipInk(deal.theme), modifier = Modifier.size(14.dp))
                    }
                    Text(
                        ctaTitle(deal, isMission, isClaimed, isActive),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = PulseThemes.chipInk(deal.theme),
                        maxLines = 1
                    )
                }
            }
        }

        if (isActive) {
            Box(
                Modifier.align(Alignment.TopEnd).size(26.dp).clip(CircleShape).background(Color.White),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Filled.Check, null, tint = PulseThemes.chipInk(deal.theme), modifier = Modifier.size(12.dp))
            }
        }
    }
}

@Composable
private fun DealChip(text: String, theme: String?, height: Int) {
    Box(
        Modifier.height(height.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.94f))
            .padding(horizontal = if (height > 24) 10.dp else 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text,
            fontSize = if (height > 24) 13.sp else 10.sp,
            fontWeight = FontWeight.Black,
            color = PulseThemes.chipInk(theme),
            maxLines = 1,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun MissionProgressBar(progress: HomeAppDealMissionProgress) {
    val fraction = if (progress.target > 0) (progress.count.toFloat() / progress.target.toFloat()).coerceIn(0f, 1f) else 0f
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.25f))) {
            Box(
                Modifier.fillMaxHeight().fillMaxWidth(fraction.coerceAtLeast(0.05f))
                    .clip(RoundedCornerShape(50)).background(Color.White)
            )
        }
        Text(
            if (progress.completed) {
                "Uppdraget klart, poängen är dina"
            } else if (progress.windowDays > 0) {
                "${progress.remaining} kvar inom ${progress.windowDays} dagar"
            } else {
                "${progress.remaining} beställningar kvar"
            },
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White.copy(alpha = 0.85f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

private fun valueHeadline(deal: HomeAppDeal): String? {
    val progress = deal.missionProgress
    if (!deal.missionType.isNullOrBlank() && progress != null && progress.rewardPoints > 0) return "+${progress.rewardPoints} Dpoints"
    if (deal.freeDelivery) return "Fri leverans"
    val percent = deal.discountPercent
    if (percent != null && percent > 0) return "$percent% rabatt"
    val amount = deal.amountKr
    if (amount != null && amount > 0) return "$amount kr rabatt"
    val bonus = deal.dpointsBonus
    if (bonus != null && bonus > 0) return "+$bonus Dpoints"
    return deal.badge?.takeIf { it.isNotBlank() }
}

private fun ctaTitle(deal: HomeAppDeal, isMission: Boolean, isClaimed: Boolean, isActive: Boolean): String {
    if (isMission) {
        val progress = deal.missionProgress
        if (progress != null) {
            if (progress.completed) return "Klart!"
            if (isClaimed) return "${progress.count} av ${progress.target}"
        }
        return deal.ctaLabel ?: "Starta uppdraget"
    }
    if (isActive) return "Vald i kassan"
    if (isClaimed) return "Använd"
    return deal.ctaLabel ?: if (deal.claimRequired) "Hämta" else "Beställ"
}

private object PulseThemes {
    fun gradient(theme: String?): Brush {
        val colors = when (theme) {
            "ember" -> listOf(Color(0.94f, 0.38f, 0.12f), Color(0.72f, 0.16f, 0.10f))
            "forest" -> listOf(Color(0.13f, 0.58f, 0.36f), Color(0.05f, 0.36f, 0.24f))
            "midnight" -> listOf(Color(0.16f, 0.18f, 0.30f), Color(0.05f, 0.06f, 0.14f))
            "gold" -> listOf(Color(0.87f, 0.63f, 0.16f), Color(0.62f, 0.40f, 0.05f))
            else -> listOf(DeliveraTheme.dealBlue, DeliveraTheme.dealBlueDeep)
        }
        return Brush.linearGradient(colors = colors, start = Offset(0f, 0f), end = Offset.Infinite)
    }

    fun chipInk(theme: String?): Color =
        when (theme) {
            "ember" -> Color(0.55f, 0.13f, 0.06f)
            "forest" -> Color(0.04f, 0.30f, 0.19f)
            "midnight" -> Color(0.08f, 0.09f, 0.20f)
            "gold" -> Color(0.47f, 0.30f, 0.03f)
            else -> DeliveraTheme.dealBlueInk
        }
}
