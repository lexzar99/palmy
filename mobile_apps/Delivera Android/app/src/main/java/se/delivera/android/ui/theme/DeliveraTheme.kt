package se.delivera.android.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow

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
