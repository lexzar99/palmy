import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList,
  Image, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { api, getImageUrl } from '../lib/api';
import { getScreenCache, setScreenCache } from '../lib/screenCache';
import { palette } from '../constants/theme';
import { getBottomTabsContentPadding } from '../constants/layout';
import StarRating from '../components/StarRating';
import ScalePressable from '../components/ScalePressable';
import type { Restaurant } from '../types';

const CUISINE_CHIPS = ['Pizza', 'Sushi', 'Burgare', 'Kebab', 'Asiatiskt', 'Pasta', 'Sallad', 'Snabbmat'];

type Cache = { restaurants: Restaurant[] };

function RestaurantRow({ restaurant, onPress, index }: { restaurant: Restaurant; onPress: () => void; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      delay: Math.min(index, 7) * 40,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity }}>
      <ScalePressable
        onPress={onPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(125,97,38,0.07)',
        }}
      >
        <View style={{
          width: 68, height: 68, borderRadius: 18, overflow: 'hidden',
          backgroundColor: palette.panelMuted, flexShrink: 0,
        }}>
          {!!(restaurant.heroImageUrl || restaurant.imageUrl) && (
            <Image
              source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }}
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: palette.text, fontSize: 15, fontWeight: '800', marginBottom: 3 }}>
            {restaurant.name}
          </Text>
          <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11, fontWeight: '600', marginBottom: 5 }}>
            {[restaurant.cuisine, restaurant.city].filter(Boolean).join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <StarRating rating={restaurant.rating} size={11} showNumber />
            <View style={{
              paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
              backgroundColor: restaurant.isOpen === false ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)',
            }}>
              <Text style={{ fontSize: 9, fontWeight: '900', color: restaurant.isOpen === false ? '#fb7185' : '#10b981' }}>
                {restaurant.isOpen === false ? 'STÄNGD' : 'ÖPPET'}
              </Text>
            </View>
            <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700' }}>
              ~{Math.round(restaurant.etaMinutes || 30)} min
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color="rgba(125,97,38,0.35)" />
      </ScalePressable>
    </Animated.View>
  );
}

export default function DiscoverScreen({
  openRestaurant,
  goBack,
  initialFilteredIds,
  filteredTitle,
  autoFocus,
}: {
  openRestaurant: (slug: string) => void;
  goBack: () => void;
  initialFilteredIds?: string[];
  filteredTitle?: string;
  autoFocus?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const token = useAppStore((s) => s.token);
  const cacheKey = token || '__guest__';
  const cachedData = getScreenCache<Cache>('discover', cacheKey);
  const clearFilteredIds = useAppStore((s) => s.setFilteredRestaurantIds);
  const storedFilteredIds = useAppStore((s) => s.filteredRestaurantIds);

  const [restaurants, setRestaurants] = useState<Restaurant[]>(() => cachedData?.restaurants || []);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(!cachedData);
  const inputRef = useRef<TextInput>(null);

  // Fade the content list when query changes
  const listOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (initialFilteredIds) clearFilteredIds(null);
  }, [initialFilteredIds, clearFilteredIds]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get('/api/restaurants');
        if (!active) return;
        const next = (res.data || []) as Restaurant[];
        setRestaurants(next);
        setScreenCache<Cache>('discover', cacheKey, { restaurants: next });
      } catch {
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [cacheKey]);

  const handleQueryChange = useCallback((text: string) => {
    Animated.timing(listOpacity, {
      toValue: 0,
      duration: 80,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setQuery(text);
      Animated.timing(listOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [listOpacity]);

  const activeFilteredIds = initialFilteredIds || storedFilteredIds;

  const results = (activeFilteredIds
    ? restaurants.filter((r) => activeFilteredIds.includes(r.id))
    : restaurants
  ).filter((r) => {
    if (!query) return true;
    const hay = `${r.name} ${r.cuisine || ''} ${(r.tags || []).join(' ')}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const trending = [...restaurants]
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 12);

  const showResults = !!query || !!activeFilteredIds;
  const listData = showResults ? results : trending;
  const listLabel = filteredTitle
    ? `${results.length} RESTAURANGER`
    : showResults
    ? query
      ? `${results.length} RESULTAT FÖR "${query.toUpperCase()}"`
      : `${results.length} RESTAURANGER`
    : 'POPULÄRT JUST NU';

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* ─── Sökruta + rubrik ─────────────────────────────────── */}
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 0,
        backgroundColor: palette.bg,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
          <Pressable
            onPress={() => { clearFilteredIds(null); goBack(); }}
            style={{
              width: 42, height: 42, borderRadius: 14, backgroundColor: palette.panel,
              borderWidth: 1, borderColor: palette.border,
              alignItems: 'center', justifyContent: 'center', marginRight: 12,
            }}
          >
            <Ionicons name="chevron-back" size={18} color={palette.gold} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.3 }}>
              {filteredTitle || 'Sök'}
            </Text>
          </View>

          {!!query && (
            <Pressable
              onPress={() => handleQueryChange('')}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: palette.gold, fontSize: 12, fontWeight: '800' }}>RENSA</Text>
            </Pressable>
          )}
        </View>

        {/* Sökruta */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: palette.panel,
          borderRadius: 20, borderWidth: 1, borderColor: palette.border,
          paddingHorizontal: 16, paddingVertical: 13,
          marginBottom: 14,
        }}>
          <Ionicons name="search-outline" size={18} color={palette.muted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Restaurang, maträtt eller kök..."
            placeholderTextColor={palette.muted}
            style={{ flex: 1, color: palette.text, fontSize: 15, fontWeight: '600', padding: 0 }}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {loading && <ActivityIndicator size="small" color={palette.gold} />}
        </View>

        {/* Cuisine chips — alltid synliga som snabbfilter */}
        <View style={{
          flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6,
          paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(125,97,38,0.08)',
        }}>
          {CUISINE_CHIPS.map((chip) => {
            const active = query.toLowerCase() === chip.toLowerCase();
            return (
              <Pressable
                key={chip}
                onPress={() => handleQueryChange(active ? '' : chip)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7,
                  borderRadius: 12, borderWidth: 1,
                  backgroundColor: active ? palette.gold : palette.panel,
                  borderColor: active ? palette.gold : palette.border,
                }}
              >
                <Text style={{
                  fontSize: 11, fontWeight: '800',
                  color: active ? '#000' : palette.muted,
                }}>
                  {chip}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ─── Resultatlista ────────────────────────────────────── */}
      <Animated.View style={{ flex: 1, opacity: listOpacity }}>
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: getBottomTabsContentPadding(insets.bottom),
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <Text style={{
              color: palette.muted, fontSize: 9, fontWeight: '900',
              letterSpacing: 1.5, marginBottom: 8, marginTop: 4,
            }}>
              {listLabel}
            </Text>
          }
          ListEmptyComponent={
            !loading ? (
              <View style={{ alignItems: 'center', paddingTop: 48 }}>
                <Ionicons name="search-outline" size={36} color={palette.border} />
                <Text style={{ color: palette.muted, fontSize: 13, fontWeight: '700', marginTop: 14 }}>
                  Inga restauranger hittades
                </Text>
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', marginTop: 6, opacity: 0.7 }}>
                  Prova ett annat sökord
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <RestaurantRow
              restaurant={item}
              index={index}
              onPress={() => openRestaurant(item.slug)}
            />
          )}
        />
      </Animated.View>
    </View>
  );
}
