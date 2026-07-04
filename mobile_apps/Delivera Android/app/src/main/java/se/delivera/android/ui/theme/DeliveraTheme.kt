package se.delivera.android.ui.theme

import android.graphics.BlurMaskFilter
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.MenuProduct

/**
 * 1:1 port of DeliveraTheme.swift. Colours use the exact same float components
 * as the SwiftUI source so nothing shifts between platforms.
 */
object DeliveraTheme {
    val orange = Color(red = 0.94f, green = 0.31f, blue = 0.10f)
    val ink = Color(red = 0.06f, green = 0.06f, blue = 0.07f)
    val muted = Color(red = 0.43f, green = 0.42f, blue = 0.40f)
    val panel = Color.White
    val line = Color.Black.copy(alpha = 0.065f)
    val gold = Color(red = 0.94f, green = 0.73f, blue = 0.36f)

    // Deal cards. A light, clean blue identity (flat, no glow) shared by the hero
    // banner and the deal rail so everything feels like one system.
    val dealBlue = Color(red = 0.07f, green = 0.53f, blue = 0.96f)
    val dealBlueDeep = Color(red = 0.04f, green = 0.33f, blue = 0.85f)
    val dealBlueInk = Color(red = 0.03f, green = 0.24f, blue = 0.46f)
    val dealBlueChip = Color(red = 0.88f, green = 0.95f, blue = 1.0f)

    val dealBlueGradient: Brush
        get() = Brush.linearGradient(
            colors = listOf(dealBlue, dealBlueDeep),
            start = Offset(0f, 0f),
            end = Offset.Infinite
        )

    val appBackgroundBrush: Brush
        get() = Brush.linearGradient(
            colors = listOf(
                Color(red = 0.99f, green = 0.98f, blue = 0.95f),
                Color(red = 0.96f, green = 0.98f, blue = 0.96f),
                Color(red = 0.99f, green = 0.96f, blue = 0.93f)
            ),
            start = Offset(0f, 0f),
            end = Offset.Infinite
        )
}

/** shadow(color: .black.opacity(0.075), radius: 18, y: 10) equivalent. */
val cardShadowSpec = Shadow(
    color = Color.Black.copy(alpha = 0.075f),
    offset = Offset(0f, 10f),
    blurRadius = 18f
)

/**
 * Swift `cardShadow()`: black 7.5%, blur radius 18, offset y 10. Drawn with a
 * real blur (BlurMaskFilter) instead of Compose elevation, which cannot express
 * a soft, offset, low-alpha shadow.
 */
fun Modifier.cardShadow(cornerRadius: Dp = 20.dp): Modifier = drawBehind {
    val paint = Paint()
    val frameworkPaint = paint.asFrameworkPaint()
    frameworkPaint.color = android.graphics.Color.argb((0.075f * 255).toInt(), 0, 0, 0)
    frameworkPaint.maskFilter = BlurMaskFilter(18.dp.toPx(), BlurMaskFilter.Blur.NORMAL)
    val offsetY = 10.dp.toPx()
    val radius = cornerRadius.toPx()
    drawIntoCanvas { canvas ->
        canvas.drawRoundRect(
            left = 0f,
            top = offsetY,
            right = size.width,
            bottom = size.height + offsetY,
            radiusX = radius,
            radiusY = radius,
            paint = paint
        )
    }
}

/** DpointsGlyph from DeliveraTheme.swift: orange rounded square with a rotated white diamond. */
@Composable
fun DpointsGlyph(size: Dp = 18.dp) {
    Box(
        Modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.22f))
            .background(DeliveraTheme.orange),
        contentAlignment = Alignment.Center
    ) {
        Box(
            Modifier
                .size(size * 0.42f)
                .rotate(45f)
                .border(
                    width = maxOf(1.5.dp, size * 0.11f),
                    color = Color.White,
                    shape = RoundedCornerShape(size * 0.1f)
                )
        )
    }
}

/** DpointsPriceBadge from DeliveraTheme.swift: shown only when the product is rewardable. */
@Composable
fun DpointsPriceBadge(
    product: MenuProduct,
    valuePerKr: Double = 10.0,
    extrasTotal: Double = 0.0,
    quantity: Int = 1
) {
    if (product.rewardable != true) return
    Row(
        Modifier
            .height(26.dp)
            .clip(RoundedCornerShape(50))
            .background(DeliveraTheme.orange.copy(alpha = 0.09f))
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        DpointsGlyph(size = 16.dp)
        Text(
            "${product.dpointsUnitCost(valuePerKr, extrasTotal) * quantity} Dpoints",
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            color = DeliveraTheme.orange
        )
    }
}

private val DeliveraColorScheme = lightColorScheme(
    primary = DeliveraTheme.orange,
    background = Color(red = 0.99f, green = 0.98f, blue = 0.95f),
    surface = DeliveraTheme.panel,
    onPrimary = Color.White,
    onBackground = DeliveraTheme.ink,
    onSurface = DeliveraTheme.ink
)

@Composable
fun DeliveraAppTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DeliveraColorScheme) {
        Surface {
            Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
                content()
            }
        }
    }
}

/** Continuous rounded rectangle used throughout the app. */
fun deliveraCorner(radius: Float) = RoundedCornerShape(radius)
