import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../store/useAppStore";
import { api } from "../lib/api";
import {
  type QuickAddress,
  findQuickAddressByText,
  formatQuickAddress,
  readQuickAddresses,
  rememberQuickAddress,
  writeQuickAddresses,
} from "../lib/quickAddresses";
import { palette, styles } from "../constants/theme";


import { CartItem, DeliveryCheck, City, Profile } from "../types";


import AddressAutocomplete from "../components/AddressAutocomplete";
import ProductModal from "../components/ProductModal";
import { Header, ScreenWrap, PrimaryButton } from "../components/ui";
import { CartScreenSkeleton } from "../components/SkeletonLoader";

function CartEmptyState({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, marginTop: 100 }}>
      <Ionicons name="cart-outline" size={64} color={palette.muted} style={{ marginBottom: 20 }} />
      <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900", marginBottom: 8 }}>Din varukorg är tom</Text>
      <Text style={{ color: palette.muted, fontSize: 14, textAlign: "center", marginBottom: 30 }}>Upptäck mat från våra grymma restauranger!</Text>
      <PrimaryButton label="UTFORSKA RESTAURANGER" onPress={onExplore} />
    </View>
  );
}

type OrderType = "DELIVERY" | "PICKUP";
type SavedAddress = {
  id: string;
  label: string;
  street: string;
  zip: string;
  city: string;
  note?: string;
  isDefault?: boolean;
  latitude?: number;
  longitude?: number;
};

export default function CartScreen({
  openHome,
  openProfile,
  openOrder,
}: {
  openHome: () => void;
  openProfile: () => void;
  openOrder: (id: string) => void;
}) {

  const items = useAppStore((s) => s.items);
  const removeItem = useAppStore((s) => s.removeItem);
  const updateQuantity = useAppStore((s) => s.updateQuantity);
  const updateItem = useAppStore((s) => s.updateItem);
  const clearCart = useAppStore((s) => s.clearCart);
  const [editing, setEditing] = useState<{ product: any; item: CartItem } | null>(null);

  const handleEditCartItem = useCallback(async (item: CartItem) => {
    try {
      const res = await api.get(`/api/menu/products/${item.productId}`);
      setEditing({ product: res.data, item });
    } catch {}
  }, []);
  const token = useAppStore((s) => s.token);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const pendingPromoCode = useAppStore((s) => s.pendingPromoCode);
  const setPendingPromoCode = useAppStore((s) => s.setPendingPromoCode);
  const currentRestaurantId = useAppStore((s) => s.restaurantId);
  const currentRestaurantSlug = useAppStore((s) => s.restaurantSlug);
  const coords = useAppStore((s) => s.coords);
  const orderType = useAppStore((s) => s.orderType);
  const setOrderType = useAppStore((s) => s.setOrderType);
  const setAddress = useAppStore((s) => s.setAddress);
  const deliveryOverrides = useAppStore((s) => s.deliveryOverrides);
  const storeAddress = useAppStore((s) => s.address);
  const hydrated = useAppStore((s) => s.hydrated);

  const [pageLoading, setPageLoading] = useState(true);
  const [cartRestaurant, setCartRestaurant] = useState<{ name: string; slug: string } | null>(null);
  const [restaurantSettings, setRestaurantSettings] = useState({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
    estimatedDeliveryTime: 35,
  });

  // Sync delivery fees from global overrides
  useEffect(() => {
    if (currentRestaurantId && deliveryOverrides[currentRestaurantId] && orderType === "DELIVERY") {
      const ovr = deliveryOverrides[currentRestaurantId];
      if (restaurantSettings.deliveryFee !== ovr.deliveryFee || restaurantSettings.minOrderAmount !== ovr.minOrderAmount) {
        setRestaurantSettings((prev) => ({
          ...prev,
          deliveryFee: ovr.deliveryFee,
          minOrderAmount: ovr.minOrderAmount,
        }));
      }
    }
  }, [currentRestaurantId, restaurantSettings.deliveryFee, restaurantSettings.minOrderAmount, deliveryOverrides, orderType]);

  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [quickAddresses, setQuickAddresses] = useState<QuickAddress[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [selectedPersonalDeal, setSelectedPersonalDeal] = useState<any | null>(null);
  const [deliveryCheck, setDeliveryCheck] = useState<DeliveryCheck | null>(null);
  const [zoneCheckStatus, setZoneCheckStatus] = useState<"ok" | "error" | "checking" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickupCities, setPickupCities] = useState<City[]>([]);
  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    deliveryStreet: "",
    deliveryZip: "",
    deliveryCity: "",
    deliveryInstructions: "",
    note: "",
  });
  const [autocompleteValue, setAutocompleteValue] = useState("");

  const loadQuickAddresses = useCallback(async () => {
    setQuickAddresses(await readQuickAddresses());
  }, []);

  useEffect(() => {
    void loadQuickAddresses();
  }, [loadQuickAddresses]);

  // Auto-fill address when store is hydrated or address changes
  useEffect(() => {
    if (!hydrated) return;
    if (!storeAddress) return;

    setAutocompleteValue(storeAddress);

    const parts = storeAddress.split(",");
    const street = parts[0]?.trim() || "";
    const zipMatch = storeAddress.match(/\b(\d{3})\s?(\d{2})\b/);
    const zip = zipMatch ? `${zipMatch[1]}${zipMatch[2]}` : "";
    const cityMatch = storeAddress.match(/\d{3}\s?\d{2}\s+([^,]+)/);
    const city = cityMatch ? cityMatch[1].trim() : (parts[1]?.trim() || "");

    setFormData((prev) => ({
      ...prev,
      deliveryStreet: street || prev.deliveryStreet,
      deliveryZip: zip || prev.deliveryZip,
      deliveryCity: city || prev.deliveryCity,
    }));

    if (coords && storeAddress) {
      void rememberQuickAddress({
        street: storeAddress,
        city,
        zip,
        latitude: coords.lat,
        longitude: coords.lng,
      }).then(setQuickAddresses);
      return;
    }

    if (!coords && storeAddress) {
      (async () => {
        try {
          const cached = await findQuickAddressByText(storeAddress);
          if (cached?.latitude != null && cached?.longitude != null) {
            setAddress(storeAddress, { lat: cached.latitude, lng: cached.longitude });
            setQuickAddresses(await rememberQuickAddress(cached));
            return;
          }

          const GEOAPIFY_KEY = "1ec4188b70ae4a56a1061b9b861f5464";
          const res = await fetch(
            `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(storeAddress)}&filter=countrycode:se&limit=1&apiKey=${GEOAPIFY_KEY}`
          );
          const data = await res.json();
          const feature = data.features?.[0];
          if (feature) {
            const [lng, lat] = feature.geometry.coordinates;
            setAddress(storeAddress, { lat, lng });
            setQuickAddresses(
              await rememberQuickAddress({
                street: storeAddress,
                city,
                zip,
                latitude: lat,
                longitude: lng,
              }),
            );
          }
        } catch {}
      })();
    }
  }, [hydrated, storeAddress, coords, setAddress]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const extras = item.extras.reduce((extraSum: number, extra: any) => extraSum + extra.price, 0);
        return sum + (item.price + extras) * item.quantity;
      }, 0),
    [items]
  );

  const personalDiscount = useMemo(() => {
    if (!selectedPersonalDeal) return 0;
    const campaign = selectedPersonalDeal.campaign || {};
    if (subtotal < (campaign.minOrder || 0)) return 0;
    if (campaign.discountType === "PERCENTAGE") return (subtotal * campaign.discountValue) / 100;
    return campaign.discountValue || 0;
  }, [selectedPersonalDeal, subtotal]);

  const ovr = currentRestaurantId ? deliveryOverrides[currentRestaurantId] : undefined;
  const deliveryFee =
    orderType === "DELIVERY"
      ? (deliveryCheck?.deliveryFee ?? ovr?.deliveryFee ?? restaurantSettings.deliveryFee)
      : 0;
  const isTestCode = selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa";
  const total = isTestCode ? 0 : Math.max(0, subtotal + deliveryFee - personalDiscount);

  // Initial data fetch
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [settingsRes, profileRes, dealsRes, restaurantRes, citiesRes] = await Promise.all([
          api.get("/api/settings").catch(() => ({ data: {} })),
          token
            ? api.get("/api/profile", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: null }))
            : Promise.resolve({ data: null }),
          token
            ? api.get("/api/profile/deals", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          currentRestaurantId
            ? api.get(`/api/restaurants/${currentRestaurantId}`).catch(() => ({ data: null }))
            : Promise.resolve({ data: null }),
          api.get("/api/cities").catch(() => ({ data: [] })),
        ]);

        if (!active) return;

        const { deliveryFee: _df, minOrderAmount: _mo, ...nonFeeSettings } = settingsRes.data || {};
        setRestaurantSettings((current) => {
          const zoneAlreadyChecked = zoneCheckStatus === "ok";
          return {
            ...current,
            ...nonFeeSettings,
            deliveryFee: zoneAlreadyChecked ? current.deliveryFee : (restaurantRes.data?.deliveryFee ?? current.deliveryFee),
            minOrderAmount: zoneAlreadyChecked ? current.minOrderAmount : (restaurantRes.data?.minOrderAmount ?? current.minOrderAmount),
            isOpen: restaurantRes.data?.isOpen ?? settingsRes.data?.isOpen ?? current.isOpen,
          };
        });

        if (restaurantRes.data?.name) {
          setCartRestaurant({ name: restaurantRes.data.name, slug: restaurantRes.data.slug });
        }

        setProfile(profileRes.data || null);
        setPersonalDeals(dealsRes.data || []);
        setPickupCities(citiesRes.data || []);

        setFormData((current) => ({
          ...current,
          customerName: current.customerName || profileRes.data?.name || "",
          customerPhone: current.customerPhone || profileRes.data?.phone || "",
          deliveryStreet: current.deliveryStreet || profileRes.data?.address || "",
          deliveryZip: current.deliveryZip || profileRes.data?.zip || "",
        }));

        if (token) {
          const addressRes = await api
            .get("/api/profile/addresses", { headers: { Authorization: `Bearer ${token}` } })
            .catch(() => ({ data: [] }));
          if (active) {
            setSavedAddresses(addressRes.data || []);
            if ((await readQuickAddresses()).length === 0) {
              const bootstrap = (addressRes.data || [])
                .slice(0, 3)
                .map((address: any, index: number) => ({
                  label: address.label,
                  street: address.street,
                  city: address.city,
                  zip: address.zip,
                  isDefault: address.isDefault ?? index === 0,
                }));
              if (bootstrap.length > 0) {
                await writeQuickAddresses(bootstrap);
                setQuickAddresses(bootstrap);
              }
            }
          }
        }
      } finally {
        if (active) setPageLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentRestaurantId, setProfile, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-apply pending promo code
  useEffect(() => {
    if (!pendingPromoCode || !personalDeals.length) return;

    const normalizedCode = pendingPromoCode.trim().toLowerCase();
    const match = personalDeals.find((deal) => deal.code?.trim().toLowerCase() === normalizedCode);
    if (!match) return;

    setSelectedPersonalDeal(match);
    setPromoCode(match.code);
    setPendingPromoCode(null);
  }, [pendingPromoCode, personalDeals, setPendingPromoCode]);

  // Zone check — runs when coords, restaurant, or orderType change
  useEffect(() => {
    let active = true;
    (async () => {
      if (orderType !== "DELIVERY" || !coords || !currentRestaurantId) {
        if (active) {
          setDeliveryCheck(null);
          setZoneCheckStatus(null);
        }
        return;
      }
      if (active) setZoneCheckStatus("checking");
      try {
        const res = await api.post("/api/cities/validate-location", {
          lat: coords.lat,
          lng: coords.lng,
        });
        if (!active) return;

        if (!res.data?.covered) {
          setDeliveryCheck({ available: false, deliveryFee: 0, minOrder: 0 });
          setZoneCheckStatus("error");
          return;
        }

        const allRests: any[] = (res.data.cities || []).flatMap((c: any) => c.restaurants || []);
        const thisRest = allRests.find((r: any) => 
          r.id === currentRestaurantId || 
          (r.slug && currentRestaurantSlug && r.slug.toLowerCase() === currentRestaurantSlug.toLowerCase())
        );

        if (!thisRest) {
          setDeliveryCheck({ available: false, deliveryFee: 0, minOrder: 0 });
          setZoneCheckStatus("error");
          return;
        }

        if (thisRest.isOpen === false) {
          setDeliveryCheck({ available: false, deliveryFee: 0, minOrder: 0 });
          setZoneCheckStatus("error");
          // Optionally we could set a specific status for closed here, 
          // but for now we'll stick to the existing error flow which is handled later.
          return;
        }

        const fee = (thisRest.matchedZone?.deliveryFee ?? 0) / 100;
        const min = (thisRest.matchedZone?.minOrder ?? 0) / 100;
        useAppStore.getState().updateDeliveryOverride(currentRestaurantId, fee, min);

        const finalData = { available: true, deliveryFee: fee, minOrder: min };
        setDeliveryCheck(finalData);
        setZoneCheckStatus("ok");
        setRestaurantSettings((prev) => ({
          ...prev,
          deliveryFee: fee,
          minOrderAmount: min,
        }));
      } catch {
        if (active) setZoneCheckStatus(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [coords, currentRestaurantId, orderType]);

  const handlePromo = useCallback(() => {
    const code = promoCode.trim().toLowerCase();
    if (code === "test" || code === "testa") {
      setSelectedPersonalDeal({ code, campaign: { discountType: "FIXED", discountValue: total, minOrder: 0 } });
      return;
    }
    const match = personalDeals.find((deal) => deal.code?.toLowerCase() === code);
    if (match) {
      setSelectedPersonalDeal(match);
      return;
    }
    Alert.alert("Promo code", "That code was not valid.");
  }, [personalDeals, promoCode, total]);

  const handleCheckoutPress = async () => {
    if (submitting) return;
    if (!formData.customerName.trim()) {
      Alert.alert("Namn saknas", "Fyll i ditt namn.");
      return;
    }
    if (!formData.customerPhone.trim()) {
      Alert.alert("Telefon saknas", "Fyll i ditt telefonnummer.");
      return;
    }
    if (orderType === "DELIVERY" && !formData.deliveryStreet.trim()) {
      Alert.alert("Adress saknas", "Fyll i en fullständig leveransadress.");
      return;
    }
    if (!items.length) {
      Alert.alert("Tom varukorg", "Lägg till produkter först.");
      return;
    }

    setSubmitting(true);
    try {
      if (!restaurantSettings.isOpen) {
        Alert.alert("Stängt", "Restaurangen är för närvarande stängd.");
        setSubmitting(false);
        return;
      }

      if (orderType === "DELIVERY" && currentRestaurantId) {
        let currentCoords = coords;

        if (!currentCoords && formData.deliveryStreet) {
          try {
            const cached = await findQuickAddressByText(autocompleteValue || formData.deliveryStreet);
            if (cached?.latitude != null && cached?.longitude != null) {
              currentCoords = { lat: cached.latitude, lng: cached.longitude };
              setAddress(formatQuickAddress(cached), currentCoords);
            }
          } catch {}
        }

        if (!currentCoords && formData.deliveryStreet) {
          try {
            const GEOAPIFY_KEY = "1ec4188b70ae4a56a1061b9b861f5464";
            const gRes = await fetch(
              `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(formData.deliveryStreet)}&filter=countrycode:se&limit=1&apiKey=${GEOAPIFY_KEY}`
            );
            const gData = await gRes.json();
            const feature = gData.features?.[0];
            if (feature) {
              const [lng, lat] = feature.geometry.coordinates;
              currentCoords = { lat, lng };
              setAddress(formData.deliveryStreet, currentCoords);
              setQuickAddresses(
                await rememberQuickAddress({
                  street: formData.deliveryStreet,
                  city: formData.deliveryCity,
                  zip: formData.deliveryZip,
                  latitude: lat,
                  longitude: lng,
                }),
              );
            }
          } catch {}
        }

        if (currentCoords) {
          try {
            const zRes = await api.post("/api/cities/validate-location", {
              lat: currentCoords.lat,
              lng: currentCoords.lng,
            });

            if (!zRes.data?.covered) {
              setZoneCheckStatus("error");
              Alert.alert("Utanför leveransområde", "Vi levererar tyvärr inte till din adress. Ange en annan adress eller välj avhämtning.", [{ text: "OK" }]);
              setSubmitting(false);
              return;
            }

            const allRests: any[] = (zRes.data.cities || []).flatMap((c: any) => c.restaurants || []);
            const thisRest = allRests.find((r: any) => 
              r.id === currentRestaurantId || 
              (r.slug && currentRestaurantSlug && r.slug.toLowerCase() === currentRestaurantSlug.toLowerCase())
            );

            if (!thisRest || (thisRest.isOpen === false)) {
              setZoneCheckStatus("error");
              Alert.alert("Leverans ej möjlig", "Den här restaurangen kan tyvärr inte leverera till din adress just nu.", [{ text: "OK" }]);
              setSubmitting(false);
              return;
            }

            const freshFee = (thisRest.matchedZone.deliveryFee ?? 0) / 100;
            const freshMin = (thisRest.matchedZone.minOrder ?? 0) / 100;
            useAppStore.getState().updateDeliveryOverride(currentRestaurantId, freshFee, freshMin);
            setDeliveryCheck({ available: true, deliveryFee: freshFee, minOrder: freshMin });
            setRestaurantSettings((prev) => ({ ...prev, deliveryFee: freshFee, minOrderAmount: freshMin }));
            setZoneCheckStatus("ok");
          } catch {}
        } else if (formData.deliveryStreet) {
          Alert.alert("Kunde inte verifiera adress", "Vänligen välj din adress från förslagen.");
          setSubmitting(false);
          return;
        }
      }

      if (subtotal < restaurantSettings.minOrderAmount) {
        Alert.alert("Minsta ordervärde", `Minsta ordervärde är ${restaurantSettings.minOrderAmount} kr.`);
        setSubmitting(false);
        return;
      }

      const isTestFlow = selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa";

      const payload = {
        type: orderType,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        deliveryStreet: orderType === "DELIVERY" ? formData.deliveryStreet : undefined,
        deliveryZip: orderType === "DELIVERY" ? formData.deliveryZip : undefined,
        deliveryCity: orderType === "DELIVERY" ? formData.deliveryCity : undefined,
        deliveryInstructions: orderType === "DELIVERY" ? formData.deliveryInstructions || undefined : undefined,
        deliveryNote: formData.note || undefined,
        note: formData.note || undefined,
        stripePaymentIntentId: isTestFlow ? "FREE_PROMO" : "BYPASS",
        discountCode: selectedPersonalDeal?.code || undefined,
        appliedDealId: undefined,
        restaurantId: currentRestaurantId || undefined,
        restaurantSlug: currentRestaurantSlug || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          note: item.note,
          selectedExtras: item.extras.map((extra: any) => ({
            groupId: extra.groupId,
            groupName: extra.groupName,
            extraId: extra.extraId,
            extraName: extra.name,
            priceAddon: extra.price,
          })),
        })),
      };

      // Refresh Supabase token before submitting to ensure userId is linked
      let freshToken = token;
      if (token) {
        try {
          const { supabase } = await import("../lib/supabase");
          const { data } = await supabase.auth.getSession();
          if (data.session?.access_token) {
            freshToken = data.session.access_token;
            // Update stored token if it changed (e.g. after auto-refresh)
            if (freshToken !== token) {
              useAppStore.getState().setToken(freshToken);
            }
          }
        } catch {
          // Fall back to existing token
        }
      }

      const response = await api.post("/api/orders", payload, {
        headers: freshToken ? { Authorization: `Bearer ${freshToken}` } : {},
      });

      const successId = response.data?.orderId || response.data?.id;
      if (successId) {
        clearCart();
        openOrder(successId);
      } else {
        Alert.alert("Serverfel", "Inget order-ID returnerades: " + JSON.stringify(response.data));
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || "Okänt fel";
      Alert.alert("Kunde inte skicka order", typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <ScreenWrap>
        <Header title="Din kasse" subtitle="Förbereder din beställning" />
        <CartScreenSkeleton />
      </ScreenWrap>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Header
        title="Din kasse"
        subtitle={items.length === 1 ? "1 produkt" : `${items.length} produkter`}
      />

      {pageLoading && (
        <View style={{ alignItems: "center", paddingVertical: 36, gap: 10 }}>
          <ActivityIndicator size="large" color={palette.gold} />
          <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" }}>Förbereder din kasse...</Text>
        </View>
      )}

      {!pageLoading && !items.length && <CartEmptyState onExplore={openHome} />}

      {!pageLoading && !!items.length && (
        <>
          {/* 1. Item List */}
          <View style={styles.cartItemList}>
            {items.map((item) => (
              <View key={item.cartItemId} style={styles.cartItem}>
                <Pressable onPress={() => handleEditCartItem(item)} style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>
                    {item.quantity}x {item.name}
                  </Text>
                  {item.extras.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {item.extras.map((e: any) => (
                        <View
                          key={e.extraId}
                          style={{ backgroundColor: palette.panelMuted, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: palette.border }}
                        >
                          <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>{e.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={{ color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 2, marginTop: 6, opacity: 0.7 }}>TRYCK FÖR ATT REDIGERA</Text>
                </Pressable>
                <View style={[styles.cartActions, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                  <View style={styles.counter}>
                    <Pressable hitSlop={10} onPress={() => updateQuantity(item.cartItemId, -1)}>
                      <Ionicons name="remove" size={18} color={palette.muted} />
                    </Pressable>
                    <Text style={styles.counterText}>{item.quantity}</Text>
                    <Pressable hitSlop={10} onPress={() => updateQuantity(item.cartItemId, 1)}>
                      <Ionicons name="add" size={18} color={palette.gold} />
                    </Pressable>
                  </View>
                  <Pressable hitSlop={10} onPress={() => removeItem(item.cartItemId)}>
                    <Ionicons name="trash-outline" size={18} color={palette.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          {/* 2. Order Type Toggle */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 4 }}>
            {(["DELIVERY", "PICKUP"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => setOrderType(type)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: orderType === type ? palette.gold : palette.panel,
                  borderRadius: 22,
                  paddingVertical: 16,
                  borderWidth: 1,
                  borderColor: orderType === type ? palette.gold : palette.border,
                }}
              >
                <Ionicons
                  name={type === "DELIVERY" ? "bicycle-outline" : "storefront-outline"}
                  size={20}
                  color={orderType === type ? "#000" : palette.muted}
                />
                <Text
                  style={{
                    color: orderType === type ? "#000" : palette.text,
                    fontWeight: "900",
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: 1,
                  }}
                >
                  {type === "DELIVERY" ? "Leverans" : "Hämtning"}
                </Text>
              </Pressable>
            ))}
          </View>

          {!token && (
            <View style={[styles.formCard, { borderColor: "rgba(231,178,75,0.2)", backgroundColor: "rgba(231,178,75,0.03)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(231,178,75,0.1)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-outline" size={20} color={palette.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>Beställ som gäst</Text>
                  <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", marginTop: 2 }}>Logga in för personliga erbjudanden och se tidigare beställningar.</Text>
                </View>
                <Pressable onPress={openProfile} style={{ backgroundColor: palette.gold, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
                  <Text style={{ color: "#000", fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>Logga in</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 3. Customer Info */}
          <View style={styles.formCard}>
            <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Personuppgifter</Text>
            <View style={{ gap: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Fullständigt namn"
                placeholderTextColor={palette.muted}
                value={formData.customerName}
                onChangeText={(value) => setFormData((v) => ({ ...v, customerName: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Telefonnummer"
                placeholderTextColor={palette.muted}
                keyboardType="phone-pad"
                value={formData.customerPhone}
                onChangeText={(value) => setFormData((v) => ({ ...v, customerPhone: value }))}
              />
            </View>
          </View>

          {/* 4. Delivery Info */}
          {orderType === "DELIVERY" && (
            <View style={styles.formCard}>
              <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Leveransadress</Text>

              {quickAddresses.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {quickAddresses.map((addr) => (
                      <Pressable
                        key={`${addr.street}-${addr.zip || ""}-${addr.city || ""}`}
                        onPress={async () => {
                          const full = formatQuickAddress(addr);
                          const next = await rememberQuickAddress(addr);
                          setQuickAddresses(next);
                          setAutocompleteValue(full);
                          setFormData((v) => ({
                            ...v,
                            deliveryStreet: addr.street,
                            deliveryZip: addr.zip || "",
                            deliveryCity: addr.city || "",
                          }));
                          if (addr.latitude && addr.longitude) {
                            setAddress(full, { lat: addr.latitude, lng: addr.longitude });
                            setZoneCheckStatus("checking");
                          } else {
                            setZoneCheckStatus(null);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderRadius: 14,
                          backgroundColor: autocompleteValue === formatQuickAddress(addr) ? "rgba(234,181,69,0.12)" : palette.panelMuted,
                          borderWidth: 1,
                          borderColor: autocompleteValue === formatQuickAddress(addr) ? palette.gold : palette.border,
                        }}
                      >
                        <Ionicons
                          name={addr.label === "Hem" ? "home-outline" : addr.label === "Jobb" ? "briefcase-outline" : "map-outline"}
                          size={14}
                          color={autocompleteValue === formatQuickAddress(addr) ? palette.gold : palette.muted}
                        />
                        <Text numberOfLines={1} style={{ color: autocompleteValue === formatQuickAddress(addr) ? palette.gold : palette.text, fontSize: 10, fontWeight: "900" }}>
                          {formatQuickAddress(addr)}
                        </Text>
                        {addr.isDefault && <Text style={{ color: palette.gold, fontSize: 8, fontWeight: "900" }}>• STANDARD</Text>}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={{ gap: 10 }}>
                <AddressAutocomplete
                  value={autocompleteValue}
                  onChangeText={(val: string) => {
                    setAutocompleteValue(val);
                    if (val !== autocompleteValue) setZoneCheckStatus(null);
                  }}
                  onSelect={(addr: string, selectedCoords: any, parts: any) => {
                    setAutocompleteValue(addr);
                    setAddress(addr, selectedCoords);
                    setFormData((v) => ({
                      ...v,
                      deliveryStreet: parts?.street || addr,
                      deliveryZip: parts?.zip || "",
                      deliveryCity: parts?.city || "",
                    }));
                    if (selectedCoords?.lat != null && selectedCoords?.lng != null) {
                      void rememberQuickAddress({
                        label: undefined,
                        street: parts?.street || addr,
                        city: parts?.city || "",
                        zip: parts?.zip || "",
                        latitude: selectedCoords.lat,
                        longitude: selectedCoords.lng,
                      }).then(setQuickAddresses);
                    }
                    setZoneCheckStatus("checking");
                  }}
                  placeholder="Sök din leveransadress..."
                />

                {zoneCheckStatus === "checking" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
                    <ActivityIndicator size="small" color={palette.gold} />
                    <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 }}>Kontrollerar leveranszon...</Text>
                  </View>
                )}
                {zoneCheckStatus === "ok" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.2)" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: palette.success, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="checkmark" size={12} color="#000" />
                    </View>
                    <Text style={{ color: palette.success, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Vi levererar dit!{" "}
                      {deliveryCheck?.deliveryFee != null && deliveryCheck.deliveryFee > 0
                        ? `Avgift: ${Math.round(deliveryCheck.deliveryFee)} kr`
                        : deliveryCheck?.deliveryFee === 0
                          ? "Gratis leverans"
                          : ""}
                    </Text>
                  </View>
                )}
                {zoneCheckStatus === "error" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: palette.danger, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </View>
                    <Text style={{ color: palette.danger, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5, flex: 1 }}>
                      Restaurangen levererar tyvärr inte till din adress
                    </Text>
                  </View>
                )}

                {!!formData.deliveryStreet && (
                  <View style={{ marginTop: 8, padding: 14, borderRadius: 16, backgroundColor: palette.panelMuted, borderWidth: 1, borderColor: palette.border }}>
                    <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Vald adress</Text>
                    <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{formData.deliveryStreet}</Text>
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 2 }}>
                      {formData.deliveryZip} {formData.deliveryCity}
                    </Text>
                  </View>
                )}

                <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 12, marginBottom: 8 }}>Instruktioner</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { id: "RING_DOORBELL", label: "Ring på", icon: "notifications-outline" },
                    { id: "LEAVE_AT_DOOR", label: "Lämna dörr", icon: "exit-outline" },
                    { id: "MEET_OUTSIDE", label: "Möt ute", icon: "person-outline" },
                    { id: "PORTKOD", label: "Portkod", icon: "key-outline" },
                  ].map((opt) => (
                    <Pressable
                      key={opt.id}
                      onPress={() =>
                        setFormData((v) => ({
                          ...v,
                          deliveryInstructions: v.deliveryInstructions === opt.id ? "" : opt.id,
                        }))
                      }
                      style={{
                        flex: 1,
                        minWidth: "46%",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingHorizontal: 14,
                        paddingVertical: 14,
                        borderRadius: 16,
                        backgroundColor: formData.deliveryInstructions === opt.id ? "rgba(234,181,69,0.12)" : palette.panelMuted,
                        borderWidth: 1,
                        borderColor: formData.deliveryInstructions === opt.id ? palette.gold : palette.border,
                      }}
                    >
                      <Ionicons name={opt.icon as any} size={16} color={formData.deliveryInstructions === opt.id ? palette.gold : palette.muted} />
                      <Text style={{ color: formData.deliveryInstructions === opt.id ? palette.gold : palette.text, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* 5. Notes & Promo */}
          <View style={styles.formCard}>
            <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Övrigt</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 14 }]}
              placeholder="Notering (t.ex. allergier, portkod...)"
              placeholderTextColor={palette.muted}
              multiline
              value={formData.note}
              onChangeText={(value) => setFormData((v) => ({ ...v, note: value }))}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Rabattkod"
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCode}
                onChangeText={(value) => {
                  if (selectedPersonalDeal) setSelectedPersonalDeal(null);
                  setPromoCode(value);
                }}
                editable={!selectedPersonalDeal}
              />
              <Pressable
                onPress={
                  selectedPersonalDeal
                    ? () => { setSelectedPersonalDeal(null); setPromoCode(""); }
                    : handlePromo
                }
                style={{
                  backgroundColor: selectedPersonalDeal ? palette.danger : palette.gold,
                  paddingHorizontal: 22,
                  justifyContent: "center",
                  borderRadius: 18,
                }}
              >
                <Text style={{ color: selectedPersonalDeal ? "#fff" : "#000", fontWeight: "900", textTransform: "uppercase", fontSize: 10 }}>
                  {selectedPersonalDeal ? "Ta bort" : "Kolla"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 6. Summary */}
          <View style={[styles.formCard, { backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 4 }]}>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>Delsumma</Text>
                <Text style={{ color: palette.text, fontWeight: "900", fontSize: 11 }}>{Math.round(subtotal)} KR</Text>
              </View>
              {orderType === "DELIVERY" && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>Leveransavgift</Text>
                  <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 11 }}>{Math.round(deliveryFee)} KR</Text>
                </View>
              )}
              {personalDiscount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.success, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5 }}>Rabatt</Text>
                  <Text style={{ color: palette.success, fontWeight: "900", fontSize: 11 }}>-{Math.round(personalDiscount)} KR</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20 }}>
              <Text style={{ color: palette.text, fontSize: 34, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", letterSpacing: -1.2 }}>Totalt</Text>
              <Text style={{ color: palette.gold, fontSize: 48, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>
                {Math.round(total)} <Text style={{ fontSize: 14, fontStyle: "normal", opacity: 0.6 }}>SEK</Text>
              </Text>
            </View>

            {subtotal < restaurantSettings.minOrderAmount && (
              <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 16, padding: 14, marginTop: 18, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                <Text style={{ color: palette.danger, fontSize: 10, fontWeight: "900", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Minsta order på {restaurantSettings.minOrderAmount} kr krävs
                </Text>
              </View>
            )}

            <PrimaryButton
              label={submitting ? "Skickar order..." : `Slutför köp — ${Math.round(total)} kr`}
              onPress={handleCheckoutPress}
              disabled={submitting || !restaurantSettings.isOpen || subtotal < restaurantSettings.minOrderAmount}
              icon="checkmark-circle-outline"
              style={{ marginTop: 28, paddingVertical: 19 }}
            />
          </View>
        </>
      )}

      {editing && (
        <ProductModal
          product={editing.product}
          address={storeAddress}
          orderType={orderType}
          editMode
          initialQuantity={editing.item.quantity}
          initialExtras={editing.item.extras}
          initialNote={editing.item.note}
          onClose={() => setEditing(null)}
          onAdd={(payload) => {
            updateItem(editing.item.cartItemId, {
              quantity: payload.quantity,
              note: payload.note,
              extras: payload.extras,
            });
            setEditing(null);
          }}
        />
      )}
    </ScrollView>
  );
}
