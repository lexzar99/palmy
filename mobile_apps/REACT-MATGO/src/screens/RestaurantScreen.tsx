import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Linking, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../store/useAppStore';
import { api, getImageUrl, SOCKET_URL } from '../lib/api';
import { getRestaurantStatusLabel } from '../lib/pauseStatus';
import { getRestaurantHeroTopInset } from '../constants/layout';
import { getScreenCache, setScreenCache } from '../lib/screenCache';
import { styles } from '../constants/theme';
import { useTheme } from '../theme';
import { EmptyPanel } from '../components/ui';
import CityModal from '../components/CityModal';
import AddressModal from '../components/AddressModal';
import RestaurantInfoModal from '../components/RestaurantInfoModal';
import RestaurantReviewsModal from '../components/RestaurantReviewsModal';
import StarRating from '../components/StarRating';
import ProductModal from '../components/ProductModal';
import PreviouslyOrderedBar from '../components/PreviouslyOrderedBar';
import { RestaurantScreenSkeleton } from '../components/SkeletonLoader';
import ScalePressable from '../components/ScalePressable';
import { useTranslation } from 'react-i18next';
import { useArabic } from '../hooks/useArabic';

import type { Restaurant, MenuCategory, MenuProduct, PublicDeal, City } from '../types';

type RestaurantScreenCache = {
  restaurant: Restaurant | null;
  categories: MenuCategory[];
  deals: PublicDeal[];
  cities: City[];
};




export default function RestaurantScreen({
  slug,
  goBack,
  openCart,
}: {
  slug: string;
  goBack: () => void;
  openCart: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { ls } = useArabic();
  const { palette } = useTheme();
  const heroTopInset = getRestaurantHeroTopInset(insets.top);
  const stickyHeaderTopInset = Math.max(insets.top - 8, 18);
  const cachedData = getScreenCache<RestaurantScreenCache>('restaurant', slug);
  const scrollYAnim = useRef(new Animated.Value(0)).current;
  const [stickyY, setStickyY] = useState(0);
  const headerPaddingTop = useMemo(
    () => scrollYAnim.interpolate({
      inputRange: [Math.max(0, stickyY - stickyHeaderTopInset), Math.max(1, stickyY)],
      outputRange: [6, stickyHeaderTopInset],
      extrapolate: 'clamp',
    }),
    [scrollYAnim, stickyY, stickyHeaderTopInset],
  );


  const [restaurant, setRestaurant] = useState<Restaurant | null>(() => cachedData?.restaurant || null);
  const [categories, setCategories] = useState<MenuCategory[]>(() => cachedData?.categories || []);
  const [deals, setDeals] = useState<PublicDeal[]>(() => cachedData?.deals || []);
  const [loading, setLoading] = useState(!cachedData);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);
  const [zoneAvailable, setZoneAvailable] = useState<boolean | null>(null);
  const [checkingZone, setCheckingZone] = useState(false);

  const menuScrollRef = useRef<ScrollView | null>(null);
  const categoryRailRef = useRef<ScrollView | null>(null);
  const categoryPositions = useRef<Record<string, number>>({});
  const categoryRailPositions = useRef<Record<string, number>>({});
  const isScrollingRef = useRef(false);

  const address = useAppStore((s) => s.address);
  const coords = useAppStore((s) => s.coords);
  const cartItems = useAppStore((s) => s.items);
  const cartRestaurantId = useAppStore((s) => s.restaurantId);
  const clearCart = useAppStore((s) => s.clearCart);
  const cartItemCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);
  const orderType = useAppStore((s) => s.orderType);
  const deliveryOverrides = useAppStore((s) => s.deliveryOverrides);
  const setAddress = useAppStore((s) => s.setAddress);
  const setOrderType = useAppStore((s) => s.setOrderType);
  const [cities, setCities] = useState<City[]>(() => cachedData?.cities || []);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);

  // Sync delivery fees from global overrides
  useEffect(() => {
    if (restaurant?.id && deliveryOverrides[restaurant.id] && orderType === "DELIVERY") {
      const ovr = deliveryOverrides[restaurant.id];
      // Only update if there is an actual difference to avoid loops
      if (restaurant.deliveryFee !== ovr.deliveryFee || restaurant.minOrderAmount !== ovr.minOrderAmount) {
        setRestaurant(prev => prev ? {
          ...prev,
          deliveryFee: ovr.deliveryFee,
          minOrderAmount: ovr.minOrderAmount
        } : null);
      }
    }
  }, [restaurant?.id, restaurant?.deliveryFee, restaurant?.minOrderAmount, deliveryOverrides, orderType]);

  useEffect(() => {
    let active = true;
    let socket: Socket | null = null;

    (async () => {
      try {
        const [menuRes, restaurantRes, dealsRes, citiesRes] = await Promise.all([
          api.get("/api/menu/categories", { params: { slug, v: "20260428" } }),
          api.get(`/api/restaurants/${slug}`),
          api.get("/api/deals").catch(() => ({ data: [] })),
          api.get("/api/cities").catch(() => ({ data: [] })),
        ]);
        if (!active) return;
        const nextCategories = (menuRes.data || []) as MenuCategory[];
        setCategories(nextCategories);
        setActiveCategory(nextCategories[0]?.id || null);
        
        const rawRest = restaurantRes.data || null;
        if (rawRest && deliveryOverrides[rawRest.id] && orderType === "DELIVERY") {
          const ovr = deliveryOverrides[rawRest.id];
          rawRest.deliveryFee = ovr.deliveryFee;
          rawRest.minOrderAmount = ovr.minOrderAmount;
        }
        setRestaurant(rawRest);
        
        const nextDeals = (dealsRes.data || []) as PublicDeal[];
        const nextCities = (citiesRes.data || []) as City[];
        setDeals(nextDeals);
        setCities(nextCities);
        setScreenCache<RestaurantScreenCache>('restaurant', slug, {
          restaurant: rawRest,
          categories: nextCategories,
          deals: nextDeals,
          cities: nextCities,
        });
      } catch {
        if (!cachedData) {
          Alert.alert("Restaurant not available", "We could not load this restaurant right now.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (orderType !== "DELIVERY" || !coords || !restaurant?.id) {
        if (active) setZoneAvailable(null);
        return;
      }
      if (active) setCheckingZone(true);
      try {
        // Use validate-location (POST) — same as homepage, gives authoritative zone fees
        // regardless of whether the restaurant has GPS coords set in the DB.
        const res = await api.post("/api/cities/validate-location", {
          lat: coords.lat,
          lng: coords.lng,
        });
        if (!active) return;

        if (!res.data?.covered) {
          // Address outside all city zones
          // Only flag as out-of-zone for open restaurants
          setZoneAvailable(restaurant.isOpen ? false : null);
          return;
        }

        const allRests: any[] = (res.data.cities || []).flatMap((c: any) => c.restaurants || []);
        const thisRest = allRests.find((r: any) => 
          r.id === restaurant.id || 
          (r.slug && restaurant.slug && r.slug.toLowerCase() === restaurant.slug.toLowerCase())
        );

        if (!thisRest) {
          // Not in results: either closed (filtered out) or outside specific zone
          // Now that backend returns closed too, this mostly means actually out of zone
          setZoneAvailable(restaurant.isOpen ? false : null);
          return;
        }

        if (thisRest.isOpen === false) {
           setZoneAvailable(null); // or handle closed state specifically
           return;
        }

        // In zone — fees are öre → kr
        const fee = (thisRest.matchedZone?.deliveryFee ?? 0) / 100;
        const min = (thisRest.matchedZone?.minOrder ?? 0) / 100;
        setZoneAvailable(true);
        setRestaurant(prev => {
          if (!prev) return null;
          if (prev.deliveryFee === fee && prev.minOrderAmount === min) return prev;
          return { ...prev, deliveryFee: fee, minOrderAmount: min };
        });
      } catch {
        if (active) setZoneAvailable(null);
      } finally {
        if (active) setCheckingZone(false);
      }
    })();
    return () => { active = false; };
  // Remove deliveryOverrides from deps — validate-location is the authoritative source
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, orderType, restaurant?.id]);

  useEffect(() => {
    let active = true;
    let socket: Socket | null = null;
    socket = io(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("settings:updated", (nextSettings: any) => {
      if (!active) return;
      setRestaurant((current) => {
        if (!current) return current;
        const isMatch = nextSettings.slug === current.slug || nextSettings.restaurantId === current.id;
        if (!isMatch) return current;
        return {
          ...current,
          isOpen: nextSettings.isOpen ?? current.isOpen,
          deliveryFee: nextSettings.deliveryFee ?? current.deliveryFee,
          minOrderAmount: nextSettings.minOrderAmount ?? current.minOrderAmount,
          etaMinutes: nextSettings.estimatedDeliveryTime ?? nextSettings.etaMinutes ?? current.etaMinutes,
        };
      });
    });

    return () => {
      active = false;
      socket?.disconnect();
    };
  }, [slug]);

  const filteredCategories = useMemo(() => {
    return categories
      .map((category) => ({
        ...category,
        products: category.products.filter((product) => {
          const text = `${product.name} ${product.description || ""}`.toLowerCase();
          return text.includes(searchTerm.toLowerCase());
        }),
      }))
      .filter((category) => category.products.length > 0);
  }, [categories, searchTerm]);

  const categoryTabs = useMemo(() => (searchTerm.trim() ? filteredCategories : categories), [categories, filteredCategories, searchTerm]);

  const discountedProducts = useMemo(
    () => categories.flatMap((category) => category.products).filter((product) => product.discountActive && product.discountScope === "PRODUCT"),
    [categories]
  );

  const restaurantNameParts = useMemo(() => {
    const parts = (restaurant?.name || "Restaurant").trim().split(/\s+/).filter(Boolean);
    return {
      primary: parts[0] || "Restaurant",
      secondary: parts.slice(1).join(" "),
    };
  }, [restaurant?.name]);

  const heroImage = restaurant?.heroImageUrl || restaurant?.imageUrl;

  useEffect(() => {
    if (!filteredCategories.length) return;
    if (!activeCategory || !filteredCategories.some((category) => category.id === activeCategory)) {
      setActiveCategory(filteredCategories[0].id);
    }
  }, [activeCategory, filteredCategories]);

  useEffect(() => {
    categoryPositions.current = {};
  }, [searchTerm, slug]);

  const addItem = useAppStore((s) => s.addItem);

  const scrollToCategory = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    const targetY = categoryPositions.current[categoryId];
    if (typeof targetY === "number") {
      isScrollingRef.current = true;
      menuScrollRef.current?.scrollTo({ y: Math.max(0, targetY + 450), animated: true });
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 400);
    }
    // Auto-scroll the category rail to show selected category
    const railX = categoryRailPositions.current[categoryId] || 0;
    categoryRailRef.current?.scrollTo({ x: Math.max(0, railX - 40), animated: true });
  }, []);

  const handleMenuScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isScrollingRef.current) return;
      
      if (!filteredCategories.length) return;

      const scrollY = event.nativeEvent.contentOffset.y + 190;
      let currentCategory = filteredCategories[0].id;

      filteredCategories.forEach((category) => {
        const position = categoryPositions.current[category.id];
        if (typeof position === "number" && position <= scrollY) {
          currentCategory = category.id;
        }
      });

      if (currentCategory !== activeCategory) {
        setActiveCategory(currentCategory);
        // Auto-scroll category rail when menu scrolls
        const railX = categoryRailPositions.current[currentCategory] || 0;
        categoryRailRef.current?.scrollTo({ x: Math.max(0, railX - 40), animated: true });
      }
    },
    [activeCategory, filteredCategories],
  );

  if (loading) {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.restaurantScreenContent}
      >
        <RestaurantScreenSkeleton heroTopInset={heroTopInset} />
      </ScrollView>
    );
  }

  return (
    <>
      <Animated.ScrollView
        ref={menuScrollRef}
        stickyHeaderIndices={[3]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollYAnim } } }],
          { useNativeDriver: false, listener: handleMenuScroll }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.restaurantScreenContent}
      >
        <View style={[styles.restaurantHeroWrap, { paddingTop: heroTopInset }]}>
          <View style={styles.restaurantHeroCardPremium}>
            {heroImage ? (
              <Image source={{ uri: getImageUrl(heroImage) }} style={styles.restaurantHeroCoverImage} />
            ) : (
              <LinearGradient colors={[palette.panelMuted, palette.bg]} style={StyleSheet.absoluteFillObject} />
            )}
            <LinearGradient colors={["rgba(255,248,239,0.14)", "rgba(255,248,239,0.62)", palette.bg]} style={styles.restaurantHeroOverlay} />

            <View style={styles.restaurantHeroTopBar}>
              <Pressable style={styles.restaurantHeroBackButton} onPress={goBack}>
                <Ionicons name="chevron-back" size={16} color={palette.gold} />
                <Text style={styles.restaurantHeroBackText}>{t('restaurant.back')}</Text>
              </Pressable>

              <View style={styles.restaurantHeroActionRow}>
                <Pressable style={styles.restaurantHeroGhostButton} onPress={() => setShowInfoModal(true)}>
                  <Ionicons name="information-circle-outline" size={15} color={palette.gold} />
                  <Text style={styles.restaurantHeroGhostButtonText}>{t('restaurant.info')}</Text>
                </Pressable>
                {!!restaurant?.phone && (
                  <Pressable
                    style={styles.restaurantHeroPrimaryButton}
                    onPress={() => Linking.openURL(`tel:${String(restaurant.phone).replace(/\s+/g, "")}`).catch(() => {})}
                  >
                    <Ionicons name="call-outline" size={15} color="#000" />
                    <Text style={styles.restaurantHeroPrimaryButtonText}>{t('restaurant.contact')}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.restaurantHeroContentPremium}>
              {(() => {
                const status = getRestaurantStatusLabel({
                  isOpen: restaurant?.isOpen,
                  pausedUntil: restaurant?.pausedUntil ?? null,
                });
                const isPaused = status.tone === "paused";
                const isClosed = status.tone === "closed";
                const fallbackLabel = isClosed
                  ? t('restaurant.statusClosed')
                  : t('restaurant.statusOpen');
                return (
                  <View style={[styles.restaurantHeroStatusPill, isClosed ? styles.restaurantHeroStatusPillClosed : styles.restaurantHeroStatusPillOpen]}>
                    <View style={[styles.restaurantHeroStatusDot, isClosed ? styles.restaurantHeroStatusDotClosed : styles.restaurantHeroStatusDotOpen]} />
                    <Text style={[styles.restaurantHeroStatusText, isClosed ? styles.restaurantHeroStatusTextClosed : styles.restaurantHeroStatusTextOpen]}>
                      {isPaused ? status.label : fallbackLabel}
                    </Text>
                  </View>
                );
              })()}

              <Text style={styles.restaurantHeroTitlePremium}>
                {restaurantNameParts.primary}{" "}
                {!!restaurantNameParts.secondary && <Text style={styles.restaurantHeroTitleAccent}>{restaurantNameParts.secondary}</Text>}
              </Text>

              <View style={styles.restaurantHeroMetaRowPremium}>
                <Text style={styles.restaurantHeroCuisine}>{(restaurant?.cuisine || "Restaurang").toUpperCase()}</Text>
                <Pressable
                  onPress={() => setShowReviewsModal(true)}
                  hitSlop={6}
                  style={({ pressed }) => [styles.restaurantHeroRatingWrap, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="star" size={12} color={palette.gold} />
                  <Text style={styles.restaurantHeroRatingText}>{(restaurant?.rating || 4.6).toFixed(1)}</Text>
                  <Text style={styles.restaurantHeroRatingCount}>({restaurant?.ratingCount || 120})</Text>
                </Pressable>
              </View>

              {zoneAvailable === false && orderType === "DELIVERY" && address && (
                <View style={{ marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: "rgba(224, 61, 61, 0.15)", borderWidth: 1, borderColor: "rgba(224, 61, 61, 0.3)", flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="alert-circle-outline" size={18} color="#ff6b6b" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#ff6b6b", fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{t('restaurant.noDelivery')}</Text>
                    <Text style={{ color: "rgba(255,107,107,0.7)", fontSize: 9, fontWeight: "700" }}>{t('restaurant.noDeliveryHelp')}</Text>
                  </View>
                  <Pressable onPress={() => setAddressModalOpen(true)} style={{ backgroundColor: "rgba(224, 61, 61, 0.2)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                    <Text style={{ color: "#ff6b6b", fontSize: 9, fontWeight: "900", textTransform: "uppercase" }}>{t('restaurant.change')}</Text>
                  </Pressable>
                </View>
              )}

              {!!restaurant?.description && (
                <Text numberOfLines={3} style={styles.restaurantHeroDescriptionPremium}>
                  {restaurant.description}
                </Text>
              )}
            </View>
          </View>
        </View>

        {restaurant?.id && (
          <PreviouslyOrderedBar
            restaurantId={restaurant.id}
            onReorderComplete={openCart}
          />
        )}

        <View style={styles.restaurantQuickStatsRow} id="stats-sticky">
          <View style={styles.restaurantQuickStatCard}>
            <Ionicons name="bicycle-outline" size={16} color={palette.gold} />
            <Text style={styles.restaurantQuickStatLabel}>{t('restaurant.fee')}</Text>
            <Text style={styles.restaurantQuickStatValue}>
              {zoneAvailable === false ? "–" : (restaurant?.deliveryFee === 0 ? t('common.free').toUpperCase() : `${Math.round(restaurant?.deliveryFee || 0)} KR`)}
            </Text>
          </View>
          <View style={styles.restaurantQuickStatCard}>
            <Ionicons name="time-outline" size={16} color={palette.gold} />
            <Text style={styles.restaurantQuickStatLabel}>{t('restaurant.eta')}</Text>
            <Text style={styles.restaurantQuickStatValue}>~{Math.round(restaurant?.etaMinutes || 35)} MIN</Text>
          </View>
          <View style={styles.restaurantQuickStatCard}>
            <Ionicons name="storefront-outline" size={16} color={palette.gold} />
            <Text style={styles.restaurantQuickStatLabel}>{t('restaurant.minOrder')}</Text>
            <Text style={styles.restaurantQuickStatValue}>{Math.round(restaurant?.minOrderAmount || 0)} KR</Text>
          </View>
        </View>

        <Animated.View
          pointerEvents="box-none"
          style={{ zIndex: 20, elevation: 20 }}
          onLayout={(e) => setStickyY(e.nativeEvent.layout.y)}
        >
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,248,239,0.98)", "rgba(255,248,239,0.95)", "rgba(255,248,239,0.76)", "rgba(255,248,239,0)"]}
            locations={[0, 0.38, 0.76, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <Animated.View style={[styles.restaurantStickyNavWrap, { paddingTop: headerPaddingTop }]}>
            <View style={styles.restaurantStickyNavCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable 
                  onPress={goBack} 
                  style={{ backgroundColor: palette.panel, padding: 12, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(125,97,38,0.12)', shadowColor: palette.gold, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}
                >
                  <Ionicons name="chevron-back" size={20} color={palette.gold} />
                </Pressable>
                
                <View style={[styles.restaurantSearchInputWrap, { flex: 1 }]}>
                  <Ionicons name="search-outline" size={18} color={palette.muted} />
                  <TextInput
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    placeholder={t('restaurant.searchPlaceholder')}
                    placeholderTextColor={palette.muted}
                    style={styles.restaurantSearchInput}
                  />
                </View>
              </View>

              <ScrollView
                ref={categoryRailRef}
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.restaurantCategoryRail}
              >
                {categoryTabs.map((category) => (
                  <ScalePressable
                    key={category.id}
                    onLayout={(event: any) => {
                      categoryRailPositions.current[category.id] = event.nativeEvent.layout.x;
                    }}
                    style={[styles.restaurantCategoryChip, activeCategory === category.id && styles.restaurantCategoryChipActive]}
                    onPress={() => scrollToCategory(category.id)}
                  >
                    <Text numberOfLines={1} style={[styles.restaurantCategoryChipText, activeCategory === category.id && styles.restaurantCategoryChipTextActive]}>
                      {category.name}
                    </Text>
                  </ScalePressable>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        </Animated.View>

        <View style={styles.restaurantMenuSectionsWrap}>
          {discountedProducts.length > 0 && (
            <View style={styles.discountedRail}>
              <View style={styles.discountedRailHeaderRow}>
                <Text style={styles.discountedRailHeaderText}>{t('restaurant.offers')}</Text>
                <View style={styles.discountedRailHeaderLine} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discountedRailContent}>
                {discountedProducts.map((product) => {
                  const salePrice = product.discountPrice || Math.round(product.price - (product.price * (product.discountPercent || 0) / 100));
                  const pctOff = product.discountPercent || Math.round((1 - salePrice / product.price) * 100);
                  const disabled = restaurant?.isOpen === false || (zoneAvailable === false && orderType === "DELIVERY");
                  return (
                    <ScalePressable
                      key={product.id}
                      style={[styles.discountedProductCard, disabled && { opacity: 0.5 }]}
                      onPress={() => {
                        if (restaurant?.isOpen === false) return;
                        if (zoneAvailable === false && orderType === "DELIVERY") { setAddressModalOpen(true); return; }
                        setSelectedProduct(product);
                      }}
                    >
                      {!!product.imageUrl ? (
                        <Image source={{ uri: getImageUrl(product.imageUrl) }} style={styles.discountedProductImage} />
                      ) : (
                        <View style={[styles.discountedProductImage, { backgroundColor: palette.panelMuted }]} />
                      )}
                      {pctOff > 0 && (
                        <View style={styles.discountedBadge}>
                          <Text style={styles.discountedBadgeText}>-{pctOff}%</Text>
                        </View>
                      )}
                      <View style={styles.discountedProductInfo}>
                        <Text numberOfLines={1} style={styles.discountedProductTitle}>{product.name}</Text>
                        <View style={styles.discountedPriceRow}>
                          <Text style={styles.discountedOriginalPrice}>{product.price} KR</Text>
                          <Text style={styles.discountedNewPrice}>{salePrice} KR</Text>
                        </View>
                      </View>
                    </ScalePressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {loading && (
            <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
              <ActivityIndicator size="large" color={palette.gold} />
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: ls(2), textTransform: "uppercase" }}>{t('restaurant.loadingMenu')}</Text>
            </View>
          )}

          {!loading && !filteredCategories.length && <EmptyPanel label="No menu items matched your search." />}

          {!loading &&
            filteredCategories.map((category) => (
              <View
                key={category.id}
                style={styles.restaurantMenuSection}
                onLayout={(event) => {
                  categoryPositions.current[category.id] = event.nativeEvent.layout.y;
                }}
              >
                <View style={styles.restaurantMenuSectionHeader}>
                  <Text style={styles.restaurantMenuSectionTitle}>{category.name}</Text>
                  <View style={styles.restaurantMenuSectionDivider} />
                </View>

                <View style={styles.restaurantMenuProductList}>
                  {category.products.map((product) => {
                    const disabled = restaurant?.isOpen === false || (zoneAvailable === false && orderType === "DELIVERY");

                    return (
                      <ScalePressable
                        key={product.id}
                        style={[styles.restaurantMenuProductCard, disabled && styles.restaurantMenuProductCardDisabled]}
                        onPress={() => {
                          if (restaurant?.isOpen === false) return;
                          if (zoneAvailable === false && orderType === "DELIVERY") {
                            setAddressModalOpen(true);
                            return;
                          }
                          setSelectedProduct(product);
                        }}
                      >
                        {!!product.imageUrl && <Image 
                        source={{ uri: getImageUrl(product.imageUrl) }} 
                        style={styles.restaurantMenuProductImage}
                        onError={(e) => console.log("Image error:", product.name, e.nativeEvent.error)}
                      />}

                        <View style={styles.restaurantMenuProductBody}>
                          <View style={styles.restaurantMenuProductTopRow}>
                            <Text numberOfLines={1} style={styles.restaurantMenuProductTitle}>
                              {product.name}
                            </Text>
                            {product.discountActive ? (
                              <View>
                                <Text style={[styles.restaurantMenuDiscountedPrice, { textAlign: "right" }]}>
                                  {product.price} KR
                                </Text>
                                <Text style={[styles.restaurantMenuDiscountedPriceCurrent, { textAlign: "right" }]}>
                                  {product.discountPrice || Math.round(product.price - product.price * (product.discountPercent || 0) / 100)} KR
                                </Text>
                              </View>
                            ) : (
                              <View style={styles.restaurantMenuPriceBadge}>
                                <Text style={styles.restaurantMenuPriceBadgeText}>{product.price} KR</Text>
                              </View>
                            )}
                          </View>

                          <Text numberOfLines={2} style={styles.restaurantMenuProductDescription}>
                            {product.description || t('restaurant.tapForExtras')}
                          </Text>

                          <View style={styles.restaurantMenuProductTags}>
                            {product.isVegan && <View style={[styles.restaurantMenuDietDot, { backgroundColor: "#22c55e" }]} />}
                            {product.isVegetarian && <View style={[styles.restaurantMenuDietDot, { backgroundColor: "#f59e0b" }]} />}
                            {product.isGlutenFree && <View style={[styles.restaurantMenuDietDot, { backgroundColor: "#38bdf8" }]} />}
                          </View>
                        </View>
                      </ScalePressable>
                    );
                  })}
                </View>
              </View>
            ))}
        </View>
      </Animated.ScrollView>

      {cartItemCount > 0 && (
        <Pressable style={styles.floatingCart} onPress={openCart}>
          <View style={{ position: "relative" }}>
            <Ionicons name="bag-handle-outline" size={18} color="#000" />
            <View
              style={{
                position: "absolute",
                top: -9,
                right: -10,
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: palette.text,
                paddingHorizontal: 5,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: palette.gold,
              }}
            >
              <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900" }}>{cartItemCount}</Text>
            </View>
          </View>
          <Text style={styles.floatingCartText}>{t('restaurant.goToCart')}</Text>
        </Pressable>
      )}

      <ProductModal
        product={selectedProduct}
        address={address}
        orderType={orderType}
        forceHide={addressModalOpen || cityModalOpen}
        onClose={() => setSelectedProduct(null)}
        onAdd={(payload: any) => {
          if (!restaurant || !selectedProduct) return;
          if (!address) {
            if (orderType === "DELIVERY") {
              setAddressModalOpen(true);
            } else {
              setCityModalOpen(true);
            }
            return;
          }
          const doAdd = () => {
            const effectivePrice = selectedProduct.discountActive
              ? (selectedProduct.discountPrice || Math.round(selectedProduct.price - selectedProduct.price * ((selectedProduct.discountPercent || 0) / 100)))
              : selectedProduct.price;
            addItem({
              productId: selectedProduct.id,
              restaurantId: restaurant.id,
              restaurantSlug: restaurant.slug,
              name: selectedProduct.name,
              price: effectivePrice,
              quantity: payload.quantity,
              extras: payload.extras,
              note: payload.note,
            });
            setSelectedProduct(null);
          };

          if (cartItems.length > 0 && cartRestaurantId && cartRestaurantId !== restaurant.id) {
            Alert.alert(
              t('restaurant.differentRestaurant'),
              t('restaurant.differentRestaurantHelp', { name: restaurant.name }),
              [
                { text: t('common.cancel'), style: "cancel" },
                {
                  text: t('restaurant.clearAndAdd'),
                  style: "destructive",
                  onPress: () => { clearCart(); doAdd(); },
                },
              ]
            );
          } else {
            doAdd();
          }
        }}
      />

      <CityModal
        open={cityModalOpen}
        cities={cities}
        selected={cities.find(c => c.name.toLowerCase() === address.toLowerCase())?.id}
        onClose={() => setCityModalOpen(false)}
        onSelect={(city: any) => {
          setAddress(city.name, null);
          setCityModalOpen(false);
          if (city.deliveryMode === "ONLY_PICKUP") setOrderType("PICKUP");
          if (city.deliveryMode === "ONLY_DELIVERY") setOrderType("DELIVERY");
        }}
      />

      <AddressModal
        visible={addressModalOpen}
        initialValue={address}
        initialOrderType={orderType as any}
        onClose={() => setAddressModalOpen(false)}
        onSelect={(addressText: string, selectedOrderType: string, coords?: any) => {
          setOrderType(selectedOrderType as any);
          setAddress(addressText, coords || undefined);
          setAddressModalOpen(false);
        }}
      />

      <RestaurantInfoModal restaurant={showInfoModal ? restaurant : null} onClose={() => setShowInfoModal(false)} />
      <RestaurantReviewsModal
        restaurantSlug={restaurant?.slug || restaurant?.id || null}
        restaurantName={restaurant?.name}
        visible={showReviewsModal}
        onClose={() => setShowReviewsModal(false)}
      />
    </>
  );
}
