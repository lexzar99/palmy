import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../lib/api';
import { palette, styles } from '../constants/theme';
import type { Restaurant } from '../types';

const dayOrder = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const dayLabels: Record<string, string> = {
  monday: "Mån", tuesday: "Tis", wednesday: "Ons",
  thursday: "Tors", friday: "Fre", saturday: "Lör", sunday: "Sön",
};

function getOpeningHoursLines(restaurant?: Restaurant | null) {
  const regular = restaurant?.openingHours?.regular;
  if (!regular) return [];
  return dayOrder.map((day) => {
    const config = regular[day];
    if (!config || config.closed || !config.shifts?.length) return `${dayLabels[day]}: Stängt`;
    return `${dayLabels[day]}: ${config.shifts.map((s: any) => `${s.open}-${s.close}`).join(", ")}`;
  });
}


export default function RestaurantInfoModal({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant | null;
  onClose: () => void;
}) {
  if (!restaurant) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { borderRadius: 34, padding: 24 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: palette.text, fontSize: 28, fontWeight: "900" }}>{restaurant.name.toUpperCase()}</Text>
              <Text style={{ color: palette.goldDark, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginTop: 6 }}>
                RESTAURANG INFORMATION
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons name="close-outline" size={24} color={palette.text} />
            </Pressable>
          </View>

          {!!restaurant.description && <Text style={[styles.helperText, { marginBottom: 18 }]}>{restaurant.description}</Text>}

          {!!(restaurant.address || restaurant.city) && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: palette.goldDark, fontWeight: "900", marginBottom: 6 }}>Adress</Text>
              <Text style={styles.helperText}>{[restaurant.address, restaurant.zip, restaurant.city].filter(Boolean).join(", ")}</Text>
            </View>
          )}

          {!!restaurant.phone && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: palette.goldDark, fontWeight: "900", marginBottom: 6 }}>Telefon</Text>
              <Text style={styles.helperText}>{restaurant.phone}</Text>
            </View>
          )}

          {!!getOpeningHoursLines(restaurant).length && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: palette.goldDark, fontWeight: "900", marginBottom: 8 }}>Öppettider</Text>
              {getOpeningHoursLines(restaurant).map((line) => (
                <Text key={line} style={[styles.helperText, { marginBottom: 4 }]}>
                  {line}
                </Text>
              ))}
            </View>
          )}

          {!!restaurant.rating && (
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: palette.border }}>
              <Text style={{ color: palette.goldDark, fontWeight: "900", marginBottom: 12 }}>RECENSIONER</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons 
                      key={star} 
                      name={star <= Math.round(restaurant.rating || 0) ? "star" : "star-outline"} 
                      size={18} 
                      color={palette.gold} 
                    />
                  ))}
                </View>
                <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>{restaurant.rating.toFixed(1)}</Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900" }}>({restaurant.ratingCount || 0} recensioner)</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
