package se.delivera.android.ui.home

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import se.delivera.android.ui.theme.DeliveraTheme
import se.delivera.android.ui.theme.DpointsGlyph
import kotlin.math.roundToInt

data class MissionCelebration(
    val points: Int,
    val title: String,
    val subtitle: String
)

/**
 * Public trigger for the mission celebration overlay (HomeView.swift shows it
 * after earned Dpoints or a finished mission). Call [show] from anywhere, the
 * app root renders the overlay while [current] is non-null.
 */
object MissionCelebrations {
    private val _current = MutableStateFlow<MissionCelebration?>(null)
    val current: StateFlow<MissionCelebration?> = _current.asStateFlow()

    fun show(points: Int, title: String, subtitle: String) {
        _current.value = MissionCelebration(points, title, subtitle)
    }

    fun dismiss() {
        _current.value = null
    }
}

/** Port of MissionCompleteOverlay (HomeView.swift:1742-1848). */
@Composable
fun MissionCompleteOverlay(celebration: MissionCelebration, onDismiss: () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    var countedPoints by remember { mutableIntStateOf(0) }
    val ringProgress = remember { Animatable(0f) }

    val appear by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.78f, stiffness = Spring.StiffnessMediumLow),
        label = "missionCelebrationAppear"
    )

    LaunchedEffect(celebration) {
        visible = true
        ringProgress.animateTo(1f, tween(durationMillis = 1_100, easing = FastOutSlowInEasing))
    }

    // Count-up: same pacing as Swift (steps clamped 12..36, 26 ms per step).
    LaunchedEffect(celebration) {
        countedPoints = 0
        val target = celebration.points.coerceAtLeast(0)
        if (target > 0) {
            val steps = target.coerceIn(12, 36)
            for (step in 1..steps) {
                delay(26)
                countedPoints = (target.toDouble() * step / steps).roundToInt()
            }
        }
    }

    // Auto-dismiss after 3.2 s, like Swift.
    LaunchedEffect(celebration) {
        delay(3_200)
        onDismiss()
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.42f)).clickable(onClick = onDismiss),
        contentAlignment = Alignment.Center
    ) {
        Column(
            Modifier
                .padding(24.dp)
                .widthIn(max = 338.dp)
                .graphicsLayer {
                    alpha = appear
                    scaleX = 0.86f + 0.14f * appear
                    scaleY = 0.86f + 0.14f * appear
                }
                .clip(RoundedCornerShape(34.dp))
                .background(Color.White.copy(alpha = 0.97f))
                .border(1.dp, Color.White.copy(alpha = 0.64f), RoundedCornerShape(34.dp))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Box(Modifier.padding(top = 8.dp).size(164.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.fillMaxSize()) {
                    val strokeWidth = 18.dp.toPx()
                    val inset = strokeWidth / 2
                    drawArc(
                        color = DeliveraTheme.orange.copy(alpha = 0.12f),
                        startAngle = 0f,
                        sweepAngle = 360f,
                        useCenter = false,
                        topLeft = Offset(inset, inset),
                        size = androidx.compose.ui.geometry.Size(size.width - strokeWidth, size.height - strokeWidth),
                        style = Stroke(width = strokeWidth)
                    )
                    drawArc(
                        brush = Brush.linearGradient(
                            listOf(
                                DeliveraTheme.orange,
                                DeliveraTheme.dealBlue,
                                Color(0.13f, 0.58f, 0.36f)
                            )
                        ),
                        startAngle = -90f,
                        sweepAngle = 360f * ringProgress.value,
                        useCenter = false,
                        topLeft = Offset(inset, inset),
                        size = androidx.compose.ui.geometry.Size(size.width - strokeWidth, size.height - strokeWidth),
                        style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
                    )
                }
                Box(
                    Modifier
                        .scale(0.65f + 0.35f * appear)
                        .rotate(-18f * (1f - appear))
                ) {
                    DpointsGlyph(size = 82.dp)
                }
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    celebration.title,
                    fontSize = 34.sp,
                    lineHeight = 38.sp,
                    fontWeight = FontWeight.Black,
                    color = DeliveraTheme.ink,
                    textAlign = TextAlign.Center
                )
                Text(
                    celebration.subtitle,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = DeliveraTheme.muted,
                    textAlign = TextAlign.Center,
                    maxLines = 2
                )
            }

            Row(
                Modifier.height(66.dp).clip(RoundedCornerShape(50)).background(DeliveraTheme.orange.copy(alpha = 0.08f)).padding(horizontal = 18.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                DpointsGlyph(size = 34.dp)
                Text("+$countedPoints Dpoints", fontSize = 32.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
            }

            Box(
                Modifier
                    .padding(top = 4.dp)
                    .fillMaxWidth()
                    .height(54.dp)
                    .clip(RoundedCornerShape(50))
                    .background(DeliveraTheme.ink)
                    .clickable(onClick = onDismiss),
                contentAlignment = Alignment.Center
            ) {
                Text("Fortsätt", fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
        }
    }
}
