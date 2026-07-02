package se.delivera.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import se.delivera.android.data.Prefs
import se.delivera.android.ui.DeliveraApp
import se.delivera.android.ui.theme.DeliveraAppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Prefs.init(applicationContext)
        enableEdgeToEdge()
        setContent {
            DeliveraAppTheme {
                DeliveraApp()
            }
        }
    }
}
