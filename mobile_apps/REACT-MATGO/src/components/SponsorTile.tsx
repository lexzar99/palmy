import React, { useState } from 'react';
import { View, Text, Pressable, Alert, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getImageUrl } from '../lib/api';
import { palette } from '../constants/theme';
import ScalePressable from './ScalePressable';

export default function SponsorTile({ 
  sponsor, 
  openRestaurant, 
  pushRoute 
}: { 
  sponsor: any; 
  openRestaurant: (slug: string) => void;
  pushRoute: (route: any) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const showName = sponsor.showName !== false;
  const imgUri = getImageUrl(sponsor.imageUrl);

  const handleCTA = () => {
    if (sponsor.linkType === 'NONE' || !sponsor.isClickable) return;
    
    const target = sponsor.linkTarget || sponsor.ctaLink;
    const rawTarget = String(target || "");
    const type = sponsor.linkType || (rawTarget.includes('://') ? 'EXTERNAL' : 'RESTAURANT');

    // Clean target: remove leading slash, and leading "restaurants/"
    let cleanTarget = rawTarget.startsWith('/') ? rawTarget.slice(1) : rawTarget;
    if (cleanTarget.startsWith('restaurants/')) {
      cleanTarget = cleanTarget.replace('restaurants/', '');
    }

    if (!cleanTarget && type !== 'EXTERNAL') {
      Alert.alert("Fel", "Denna sponsor har ingen måltavla.");
      return;
    }

    // DEBUG ALERT - REMOVE ONCE VERIFIED
    // Alert.alert("Sponsor Klick", `Typ: ${type}\nMål: ${cleanTarget}`);

    if (type === 'DEAL') {
      pushRoute({ name: 'discover-filtered', restaurantIds: [cleanTarget], dealTitle: sponsor.name });
    } else if (type === 'RESTAURANT') {
      openRestaurant(cleanTarget);
    } else if (type === 'EXTERNAL') {
      Linking.openURL(rawTarget).catch(() => Alert.alert("Fel", "Kunde inte öppna länk: " + rawTarget));
    }
  };

  if (!sponsor.isClickable) {
    return (
      <View style={{ width: 300, height: 160, borderRadius: 32, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", backgroundColor: "#111015" }}>
        {!!imgUri && <Image source={{ uri: imgUri }} style={{ width: 300, height: 160 }} resizeMode="cover" />}
      </View>
    );
  }

  return (
    <View style={{ width: 300, height: 160, borderRadius: 32, overflow: "hidden", borderWidth: 1, borderColor: flipped ? palette.gold : "rgba(255,255,255,0.06)", backgroundColor: "#121217", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12 }}>
      {!flipped ? (
        <ScalePressable onPress={() => setFlipped(true)} style={{ width: 300, height: 160 }}>
          <Image source={{ uri: imgUri }} style={{ width: 300, height: 160 }} resizeMode="cover" />
          {showName && (
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, justifyContent: "flex-end", padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(231,178,75,0.2)', borderRadius: 4 }}>
                   <Text style={{ color: palette.gold, fontSize: 7, fontWeight: "900", letterSpacing: 1 }}>PARTNER</Text>
                </View>
              </View>
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900", fontStyle: "italic" }}>{(sponsor.name || "").toUpperCase()}</Text>
            </LinearGradient>
          )}
        </ScalePressable>
      ) : (
        <View style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
          <Pressable onPress={() => setFlipped(false)} style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Ionicons name="sparkles" size={14} color={palette.gold} />
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900", fontStyle: "italic" }}>{(sponsor.name || "").toUpperCase()}</Text>
            </View>
            {!!sponsor.infoText && <Text style={{ color: "#b2a8bf", fontSize: 11, fontWeight: "700", lineHeight: 16 }} numberOfLines={4}>{sponsor.infoText}</Text>}
          </Pressable>
          
          {sponsor.linkType !== 'NONE' && !!sponsor.ctaText && (
            <ScalePressable 
              onPress={handleCTA}
              style={{
                alignSelf: "flex-end", 
                paddingHorizontal: 16, 
                paddingVertical: 10, 
                borderRadius: 14, 
                backgroundColor: palette.gold,
                shadowColor: palette.gold,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4
              }}
            >
              <Text style={{ color: "#000", fontSize: 10, fontWeight: "900" }}>{sponsor.ctaText.toUpperCase()} →</Text>
            </ScalePressable>
          )}
        </View>
      )}
    </View>
  );
}
