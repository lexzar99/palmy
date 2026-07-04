package se.delivera.android.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

@Composable
fun Entrance(
    visibleKey: Any? = Unit,
    delayMillis: Int = 0,
    offsetX: Dp = 0.dp,
    offsetY: Dp = 14.dp,
    scaleFrom: Float = 0.988f,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    var visible by remember(visibleKey) { mutableStateOf(false) }
    LaunchedEffect(visibleKey) {
        visible = false
        if (delayMillis > 0) delay(delayMillis.toLong())
        visible = true
    }

    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = 0.86f),
        label = "deliveraEntranceAlpha"
    )
    val density = LocalDensity.current
    val dx = with(density) { offsetX.toPx() }
    val dy = with(density) { offsetY.toPx() }
    val scale = scaleFrom + (1f - scaleFrom) * alpha

    Box(
        modifier.graphicsLayer {
            this.alpha = alpha
            translationX = dx * (1f - alpha)
            translationY = dy * (1f - alpha)
            scaleX = scale
            scaleY = scale
        }
    ) {
        content()
    }
}

/**
 * Spring press feedback matching Swift's `withAnimation(.spring(response: 0.4,
 * dampingFraction: 0.86))` button scale. Scales to 0.96 while pressed and
 * springs back on release. Use instead of a bare `clickable` on primary actions.
 */
fun Modifier.pressable(
    enabled: Boolean = true,
    onClick: () -> Unit,
): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMedium, dampingRatio = 0.72f),
        label = "deliveraPressScale"
    )
    graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(interactionSource = interaction, indication = null, enabled = enabled) { onClick() }
}

/**
 * Panel push/pop transition matching Swift's
 * `.move(edge: .trailing).combined(with: .opacity)` with spring timing.
 * `depth` increasing = push (new panel slides in from the right); decreasing =
 * pop (current panel slides back out to the right).
 */
@Composable
fun <T> PanelHost(
    target: T,
    depth: Int,
    modifier: Modifier = Modifier,
    content: @Composable (T) -> Unit,
) {
    var prevDepth by remember { mutableStateOf(depth) }
    val forward = depth >= prevDepth
    LaunchedEffect(depth) { prevDepth = depth }
    AnimatedContent(
        targetState = target,
        transitionSpec = {
            val spec = spring<Float>(stiffness = Spring.StiffnessMediumLow, dampingRatio = 0.88f)
            val intSpec = spring<androidx.compose.ui.unit.IntOffset>(stiffness = Spring.StiffnessMediumLow, dampingRatio = 0.88f)
            val enter = slideInHorizontally(intSpec) { full -> if (forward) full else -full / 4 } + fadeIn(spec)
            val exit = slideOutHorizontally(intSpec) { full -> if (forward) -full / 4 else full } + fadeOut(spec)
            (enter togetherWith exit).using(SizeTransform(clip = false))
        },
        modifier = modifier,
        label = "deliveraPanelHost",
    ) { content(it) }
}
