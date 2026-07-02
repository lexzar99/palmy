package se.delivera.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImagePainter
import coil.compose.SubcomposeAsyncImage
import coil.compose.SubcomposeAsyncImageContent
import se.delivera.android.ui.theme.DeliveraTheme

/** Port of RemoteImage.swift: async load with a soft static placeholder. */
@Composable
fun RemoteImage(
    urlString: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    showsFailureIcon: Boolean = true
) {
    val hasUrl = !urlString.isNullOrBlank()
    if (!hasUrl) {
        Box(modifier) { Placeholder() }
        return
    }
    SubcomposeAsyncImage(
        model = urlString,
        contentDescription = null,
        modifier = modifier,
        contentScale = contentScale,
        content = {
            when (painter.state) {
                is AsyncImagePainter.State.Success -> SubcomposeAsyncImageContent()
                is AsyncImagePainter.State.Error -> {
                    Box(Modifier.fillMaxSize()) {
                        Placeholder()
                        if (showsFailureIcon) {
                            Icon(
                                Icons.Filled.Restaurant, null,
                                tint = DeliveraTheme.ink.copy(alpha = 0.24f),
                                modifier = Modifier.align(Alignment.Center)
                            )
                        }
                    }
                }
                else -> Placeholder()
            }
        }
    )
}

@Composable
private fun Placeholder() {
    Box(
        Modifier.fillMaxSize().background(
            Brush.linearGradient(
                listOf(Color.White.copy(alpha = 0.7f), DeliveraTheme.orange.copy(alpha = 0.14f)),
                start = Offset(0f, 0f), end = Offset.Infinite
            )
        )
    )
}
