import React, { useEffect, useState } from 'react';
import { View, Text, Image, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getImageUrl } from '../lib/api';
import { palette } from '../constants/theme';
import ScalePressable from './ScalePressable';

interface DiscountedDish {
  id: string;
  name: string;
  description?: string;
  originalPrice: number;
  discountPrice: number;
  discountScope?: 'PRODUCT' | 'CATEGORY' | 'RESTAURANT' | null;
  discountPercent?: number | null;
  discountLabel?: string | null;
  imageUrl?: string | null;
  restaurant: {
    id: string;
    slug: string;
    name: string;
  };
}

export default function DiscountedDishesRail({ openRestaurant }: { openRestaurant: (slug: string) => void }) {
  const [dishes, setDishes] = useState<DiscountedDish[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/api/menu/discounted', { params: { scope: 'PRODUCT', v: '20260428' } })
      .then((r) => {
        const nextDishes = Array.isArray(r.data) ? r.data : [];
        setDishes(nextDishes.filter((dish: DiscountedDish) => dish.discountScope === 'PRODUCT'));
      })
      .catch(() => setDishes([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || dishes.length === 0) return null;

  return (
    <View>
      <View style={{ height: 0.5, backgroundColor: palette.border, marginHorizontal: 20, marginBottom: 12 }} />
      <View style={{ paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="pricetag" size={12} color={palette.gold} />
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '900', letterSpacing: 2 }}>REA &amp; RABATTER</Text>
      </View>
      <FlatList
        data={dishes}
        keyExtractor={(d) => d.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        renderItem={({ item: d }) => (
          <ScalePressable
            onPress={() => openRestaurant(d.restaurant.slug)}
            style={{ width: 160, borderRadius: 18, overflow: 'hidden', backgroundColor: palette.panel, borderWidth: 1, borderColor: 'rgba(255,248,234,0.08)' }}
          >
            <View style={{ width: '100%', height: 100, backgroundColor: palette.bg }}>
              {d.imageUrl ? (
                <Image source={{ uri: getImageUrl(d.imageUrl) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 28 }}>🍽️</Text>
                </View>
              )}
              <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: palette.gold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: '#000', fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>
                  {d.discountLabel || (d.discountPercent ? `-${d.discountPercent}%` : `-${Math.round(d.originalPrice - d.discountPrice)} KR`)}
                </Text>
              </View>
            </View>
            <View style={{ padding: 10 }}>
              <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 }}>
                {d.restaurant.name.toUpperCase()}
              </Text>
              <Text numberOfLines={1} style={{ color: palette.text, fontSize: 12, fontWeight: '900', marginTop: 2 }}>
                {d.name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <Text style={{ color: palette.gold, fontSize: 13, fontWeight: '900' }}>{d.discountPrice} kr</Text>
                <Text style={{ color: palette.muted, fontSize: 10, textDecorationLine: 'line-through' }}>{d.originalPrice} kr</Text>
              </View>
            </View>
          </ScalePressable>
        )}
        ListEmptyComponent={
          <View style={{ width: 300, height: 100, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.panel, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,248,234,0.05)' }}>
            <Ionicons name="fast-food-outline" size={24} color={palette.muted} style={{ marginBottom: 4 }} />
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>Inga rabatter släppta än</Text>
          </View>
        }
      />
    </View>
  );
}
