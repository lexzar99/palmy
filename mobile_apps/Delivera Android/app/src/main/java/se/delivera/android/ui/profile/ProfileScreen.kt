package se.delivera.android.ui.profile

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import se.delivera.android.data.Prefs
import se.delivera.android.ui.theme.DeliveraTheme

@Composable
fun ProfileScreen(
    authToken: String,
    favoriteCount: Int,
    onOpenHome: () -> Unit
) {
    var draftToken by remember { mutableStateOf("") }
    val loggedIn = authToken.isNotBlank()

    Box(Modifier.fillMaxSize().background(DeliveraTheme.appBackgroundBrush)) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 116.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (!loggedIn) {
                item {
                    Column(
                        Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text("Logga in", fontSize = 34.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink, textAlign = TextAlign.Center)
                        Text(
                            "Fortsätt med telefon eller Apple. Kontot kopplas säkert till ditt nummer.",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = DeliveraTheme.muted,
                            textAlign = TextAlign.Center
                        )
                        TokenCard(draftToken, onChange = { draftToken = it }) {
                            Prefs.authToken = draftToken.trim()
                        }
                    }
                }
            } else {
                item {
                    ProfileHero()
                }
                item { ProfileRow(Icons.Filled.History, "Mina beställningar", "Se kvitton och status") {} }
                item { ProfileRow(Icons.Filled.LocalOffer, "Mina deals", "Personliga rabatter och uppdrag") { onOpenHome() } }
                item { ProfileRow(Icons.Filled.Favorite, "Favoriter", "$favoriteCount restauranger sparade") { onOpenHome() } }
                item { ProfileRow(Icons.Filled.Settings, "Inställningar", "Namn, e-post och notiser") {} }
                item {
                    Row(
                        Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(16.dp)).background(Color.White)
                            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(16.dp)).clickable { Prefs.authToken = "" }.padding(horizontal = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.Logout, null, tint = DeliveraTheme.orange, modifier = Modifier.size(20.dp))
                        Text("Logga ut", fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.orange)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileHero() {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(24.dp)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(52.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Person, null, tint = DeliveraTheme.orange, modifier = Modifier.size(25.dp))
            }
            Column {
                Text("Din profil", fontSize = 24.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
                Text("Deals, Dpoints och historik sparas här.", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
            }
        }
    }
}

@Composable
private fun TokenCard(value: String, onChange: (String) -> Unit, onSave: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(22.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Auth-token", fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.ink),
            modifier = Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).background(Color(0.97f, 0.97f, 0.96f)).padding(horizontal = 12.dp, vertical = 14.dp),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) Text("Klistra in token för test", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
                    inner()
                }
            }
        )
        Text(
            "Spara",
            fontSize = 15.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp)).background(DeliveraTheme.orange).clickable { onSave() }.padding(top = 14.dp)
        )
    }
}

@Composable
private fun ProfileRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(68.dp).clip(RoundedCornerShape(18.dp)).background(Color.White)
            .border(1.dp, DeliveraTheme.line, RoundedCornerShape(18.dp)).clickable { onClick() }.padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(DeliveraTheme.orange.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = DeliveraTheme.orange, modifier = Modifier.size(19.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Black, color = DeliveraTheme.ink)
            Text(subtitle, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DeliveraTheme.muted)
        }
        Icon(Icons.Filled.ChevronRight, null, tint = DeliveraTheme.muted, modifier = Modifier.size(20.dp))
    }
}
