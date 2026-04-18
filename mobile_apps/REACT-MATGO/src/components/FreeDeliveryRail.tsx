import React, { useEffect, useState } from 'react';
import { View, Text, Image, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getImageUrl } from '../lib/api';
import { palette } from '../constants/theme';
import ScalePressable from './ScalePressable';

interface Item {
  id: string;
  slug: string;
  name: string;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  cuisine?: string | null;
  city?: string | null;
  rating?: number;
  etaMinutes?: number;
  isFullyFree: boolean;
  freeDeliveryAbove?: number | null;
}

export default function FreeDeliveryRail({ openRestaurant }: { openRestaurant: (slug: string) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/api/menu/free-delivery')
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || items.length === 0) return null;

  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ paddingHorizontal: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="bicycle" size={14} color="#34d399" />
        <Text style={{ color: palette.text, fontSize: 14, fontWeight: '900', letterSpacing: 2 }}>FRI LEVERANS</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        renderItem={({ item: r }) => (
          <ScalePressable
            onPress={() => openRestaurant(r.slug)}
            style={{ width: 200, borderRadius: 18, overflow: 'hidden', backgroundColor: palette.panel, borderWidth: 1, borderColor: 'rgba(255,248,234,0.08)' }}
          >
            <View style={{ width: '100%', height: 90, backgroundColor: palette.bg }}>
              {(r.heroImageUrl || r.imageUrl) ? (
                <Image source={{ uri: getImageUrl((r.heroImageUrl || r.imageUrl) as string) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 28 }}>🍽️</Text>
                </View>
              )}
              <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#10b981', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: '#000', fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>
                  {r.isFullyFree ? 'FRI LEVERANS' : `FRI ÖVER ${r.freeDeliveryAbove} KR`}
                </Text>
              </View>
            </View>
            <View style={{ padding: 10 }}>
              <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 }}>
                {(r.cuisine || r.city || 'RESTAURANG').toUpperCase()}
              </Text>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 12, fontWeight: '900', marginTop: 2 }}>
                {r.name}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 10, marginTop: 4 }}>
                {(r.etaMinutes ?? 30)} min · {r.rating ? `${r.rating.toFixed(1)}★` : 'Ny'}
              </Text>
            </View>
          </ScalePressable>
        )}
      />
    </View>
  );
}
