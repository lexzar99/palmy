package se.delivera.android.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
