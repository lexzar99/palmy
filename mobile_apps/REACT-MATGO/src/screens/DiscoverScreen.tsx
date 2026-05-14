import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList,
  Image, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useArabic } from '../hooks/useArabic';
import { useAppStore } from '../store/useAppStore';
import { api, getImageUrl } from '../lib/api';
import { getScreenCache, setScreenCache } from '../lib/screenCache';
import { useTheme } from '../theme';
import { getBottomTabsContentPadding } from '../constants/layout';
import StarRating from '../components/StarRating';
import ScalePressable from '../components/ScalePressable';
import type { Restaurant } from '../types';

const CUISINE_CHIPS = ['Favoriter', 'Pizza', 'Sushi', 'Burgare', 'Kebab', 'Asiatiskt', 'Pasta', 'Sallad', 'Snabbmat'];

type Cache = { restaurants: Restaurant[] };

function RestaurantRow({ restaurant, onPress, index }: { restaurant: Restaurant; onPress: () => void; index: number }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
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
                {restaurant.isOpen === false ? t('status.closed') : t('status.open')}
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
  initialCuisine,
}: {
  openRestaurant: (slug: string) => void;
  goBack: () => void;
  initialFilteredIds?: string[];
  filteredTitle?: string;
  autoFocus?: boolean;
  initialCuisine?: string;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { ls } = useArabic();
  const token = useAppStore((s) => s.token);
  const cacheKey = token || '__guest__';
  const favorites = useAppStore((s) => s.favorites);
  const orderType = useAppStore((s) => s.orderType);
  const pickupCity = useAppStore((s) => s.pickupCity);
  const storeAddress = useAppStore((s) => s.address);
  const deliveryCoords = useAppStore((s) => s.deliveryCoords);
  const cachedData = getScreenCache<Cache>('discover', cacheKey);
  const clearFilteredIds = useAppStore((s) => s.setFilteredRestaurantIds);
  const storedFilteredIds = useAppStore((s) => s.filteredRestaurantIds);

  const [restaurants, setRestaurants] = useState<Restaurant[]>(() => cachedData?.restaurants || []);
  const [query, setQuery] = useState(initialCuisine || '');
  const [loading, setLoading] = useState(!cachedData);
  // Zone-validated restaurant ids — restaurants that cover the user's coords.
  // null = not yet validated (or no coords); otherwise array of allowed ids.
  const [zoneRestaurantIds, setZoneRestaurantIds] = useState<string[] | null>(null);
  // Names of cities the user is in (from validate-location) — used to gate
  // pickup restaurants where we have no coords-based zone match.
  const [matchedCityNames, setMatchedCityNames] = useState<string[]>([]);
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

  // Resolve which restaurants are reachable from the user's location.
  // Strategy:
  //   1. If user has delivery coords → POST /api/cities/validate-location
  //      and use the returned restaurant ids (zone-accurate).
  //   2. Else fall back to city-name comparison further down in `results`.
  //   3. Always re-validate when coords or orderType changes.
  useEffect(() => {
    let active = true;

    // PICKUP mode uses the city-name path; no coords available.
    if (orderType === 'PICKUP') {
      setZoneRestaurantIds(null);
      setMatchedCityNames([]);
      return;
    }

    const coords = deliveryCoords;
    if (!coords?.lat || !coords?.lng) {
      setZoneRestaurantIds(null);
      setMatchedCityNames([]);
      return;
    }

    (async () => {
      try {
        const res = await api.post('/api/cities/validate-location', {
          lat: coords.lat,
          lng: coords.lng,
        });
        if (!active) return;
        if (res.data?.covered && Array.isArray(res.data.cities)) {
          const ids = res.data.cities.flatMap((c: any) =>
            Array.isArray(c.restaurants) ? c.restaurants.map((r: any) => r.id) : [],
          );
          const cityNames = res.data.cities
            .map((c: any) => c?.name?.toLowerCase?.())
            .filter(Boolean);
          setZoneRestaurantIds(ids);
          setMatchedCityNames(cityNames);
        } else {
          // Coords are outside any covered zone — show empty result.
          setZoneRestaurantIds([]);
          setMatchedCityNames([]);
        }
      } catch {
        // Network blip — leave previous filter in place; don't blank the screen.
        if (active && zoneRestaurantIds === null) {
          setZoneRestaurantIds(null);
        }
      }
    })();

    return () => { active = false; };
    // Intentionally exclude zoneRestaurantIds from deps to avoid loops; coords+orderType drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryCoords?.lat, deliveryCoords?.lng, orderType]);

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

  const isFavoritesMode = query.toLowerCase() === 'favoriter';

  // Derive user's city for the city-fallback filter — used when we don't have
  // zone-accurate coords (pickup mode) or backend validate-location fails.
  const userCity = useMemo(() => {
    if (orderType === 'PICKUP') return pickupCity?.trim().toLowerCase() || null;
    if (storeAddress) {
      // "Street, City, Country" → middle segment is usually the city
      const parts = storeAddress.split(',').map((s) => s.trim());
      if (parts.length >= 2) return parts[parts.length - 2].toLowerCase();
    }
    return null;
  }, [orderType, pickupCity, storeAddress]);

  // Does the user have any kind of location signal we can filter by?
  const hasLocationSignal = !!(deliveryCoords?.lat || pickupCity || userCity);

  // Restaurant-level city/zone gate. Returns true if the restaurant is
  // reachable from the user's current location signal. Used to hide
  // restaurants in other cities (e.g. Malmö restaurants while the user
  // is in Lund).
  const matchesUserLocation = useCallback((r: Restaurant) => {
    // 1. Zone-accurate (delivery coords + validate-location result)
    if (zoneRestaurantIds !== null) {
      return zoneRestaurantIds.includes(r.id);
    }
    // 2. City-name fallback (pickup, or no coords)
    if (userCity && r.city) {
      return r.city.toLowerCase() === userCity;
    }
    if (matchedCityNames.length > 0 && r.city) {
      return matchedCityNames.includes(r.city.toLowerCase());
    }
    // 3. No location signal → show everything (we'll prompt user to set address)
    return true;
  }, [zoneRestaurantIds, userCity, matchedCityNames]);

  const results = (activeFilteredIds
    ? restaurants.filter((r) => activeFilteredIds.includes(r.id))
    : restaurants
  ).filter((r) => {
    // City/zone gate first — applies to all queries and favorites alike,
    // including pickup mode via the city-name fallback.
    if (!matchesUserLocation(r)) return false;

    if (isFavoritesMode) {
      return favorites.includes(r.id);
    }
    if (!query) return true;
    const hay = `${r.name} ${r.cuisine || ''} ${(r.tags || []).join(' ')}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const trending = [...restaurants]
    .filter(matchesUserLocation)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 12);

  const showResults = !!query || !!activeFilteredIds;
  const listData = showResults ? results : trending;
  const listLabel = filteredTitle
    ? t('discover.restaurants', { count: results.length })
    : isFavoritesMode
    ? t('discover.favorites', { count: results.length })
    : showResults
    ? query
      ? t('discover.results', { count: results.length, query: query.toUpperCase() })
      : t('discover.restaurants', { count: results.length })
    : t('discover.trending');

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
              {filteredTitle || (initialCuisine ? initialCuisine : t('discover.title'))}
            </Text>
          </View>

          {!!query && (
            <Pressable
              onPress={() => handleQueryChange('')}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: palette.gold, fontSize: 12, fontWeight: '800' }}>{t('discover.clear')}</Text>
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
            placeholder={t('discover.searchPlaceholder')}
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
                  {t(`discover.cuisineChips.${chip}`, chip)}
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
              letterSpacing: ls(1.5), marginBottom: 8, marginTop: 4,
            }}>
              {listLabel}
            </Text>
          }
          ListEmptyComponent={
            !loading ? (
              <View style={{ alignItems: 'center', paddingTop: 48 }}>
                <Ionicons
                  name={
                    !hasLocationSignal
                      ? 'location-outline'
                      : isFavoritesMode
                      ? 'heart-outline'
                      : 'search-outline'
                  }
                  size={36}
                  color={palette.border}
                />
                <Text style={{ color: palette.muted, fontSize: 13, fontWeight: '700', marginTop: 14 }}>
                  {!hasLocationSignal
                    ? t('discover.empty.noAddress')
                    : isFavoritesMode
                    ? t('discover.empty.noFavorites')
                    : !query && restaurants.length > 0
                    ? t('discover.empty.noCity')
                    : t('discover.empty.noResults')}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', marginTop: 6, opacity: 0.7 }}>
                  {!hasLocationSignal
                    ? t('discover.empty.noAddressHelp')
                    : isFavoritesMode
                    ? t('discover.empty.noFavoritesHelp')
                    : !query && restaurants.length > 0
                    ? t('discover.empty.noCityHelp')
                    : t('discover.empty.noResultsHelp')}
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
