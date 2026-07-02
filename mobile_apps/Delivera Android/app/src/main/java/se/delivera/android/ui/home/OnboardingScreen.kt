package se.delivera.android.ui.home

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.DeliveryDining
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.ui.theme.DeliveraTheme

@Composable
fun OnboardingScreen(onContinue: () -> Unit, onLogin: () -> Unit) {
    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush).padding(22.dp)) {
        Column(
            Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(Modifier.size(86.dp).clip(CircleShape).background(DeliveraTheme.orange), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Stars, null, tint = Color.White, modifier = Modifier.size(42.dp))
            }
            Spacer(Modifier.height(22.dp))
            Text("Delivera", fontSize = 42.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, textAlign = TextAlign.Center)
            Text(
                "Deals, Dpoints och mat från lokala favoriter.",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = DeliveraTheme.muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 6.dp, bottom = 24.dp)
            )
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OnboardingRow(Icons.Filled.LocalOffer, "Hämta deals", "Spara erbjudanden och använd dem i kassan.")
                OnboardingRow(Icons.Filled.CardGiftcard, "Samla Dpoints", "Beställ, recensera och lås upp rewards.")
                OnboardingRow(Icons.Filled.DeliveryDining, "Följ ordern", "Status, kvitto och uppdateringar direkt i appen.")
            }
            Spacer(Modifier.height(24.dp))
            Text(
                "Kom igång",
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(18.dp))
                    .background(DeliveraTheme.orange).clickable { onContinue() }.padding(top = 15.dp)
            )
            Text(
                "Logga in",
                fontSize = 14.sp,
                fontWeight = FontWeight.Black,
                color = DeliveraTheme.ink,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp).clickable { onLogin() }
            )
        }
    }
}

@Composable
private fun OnboardingRow(icon: ImageVector, title: String, subtitle: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(20.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(42.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = DeliveraTheme.orange, modifier = Modifier.size(21.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
            Text(subtitle, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        }
    }
}
