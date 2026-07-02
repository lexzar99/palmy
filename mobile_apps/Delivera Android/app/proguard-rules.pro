# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class se.delivera.android.** {
    *** Companion;
}
-keepclasseswithmembers class se.delivera.android.** {
    kotlinx.serialization.KSerializer serializer(...);
}
