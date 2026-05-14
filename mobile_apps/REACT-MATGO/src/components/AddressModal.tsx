/**
 * AddressModal — React Native (Expo)
 *
 * Centered overlay (not a bottom sheet).
 * DELIVERY mode → Swedish address autocomplete via backend proxy.
 * PICKUP mode   → City dropdown fetched from /api/cities.
 *
 * Design mirrors the web app: light card, vibrant accents, rounded corners.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL } from "../lib/api";
import { useTheme } from "../theme";
import { useTranslation } from "react-i18next";

// Session token for Google billing grouping
const makeToken = () =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

export type OrderType = "DELIVERY" | "PICKUP";

interface Prediction {
  description: string;
  place_id: string;
}

interface CityOption {
  id: string;
  name: string;
  slug: string;
  deliveryMode: string;
}

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AddressModalProps {
  visible: boolean;
  initialValue?: string;
  initialOrderType?: OrderType;
  onClose: () => void;
  /** Called when the user confirms. orderType is always the current toggle state. */
  onSelect: (
    address: string,
    orderType: OrderType,
    coords?: { lat: number; lng: number }
  ) => void;
}

// ── Colours ──────────────────────────────────────────────────────────────────
// Built per-render so we pick up the active palette from useTheme.
const buildColors = (palette: ReturnType<typeof useTheme>["palette"]) => ({
  bg:        palette.bg,
  card:      palette.panel,
  surface:   palette.card,
  border:    palette.border,
  gold:      palette.gold,
  goldDark:  palette.goldDark,
  goldDim:   "rgba(217,176,85,0.18)",
  text:      palette.text,
  muted:     palette.muted,
  dim:       "rgba(33,22,15,0.66)",
  green:     palette.success,
  greenBg:   "rgba(22,163,74,0.12)",
  red:       palette.danger,
  redBg:     "rgba(220,38,38,0.12)",
  overlay:   "rgba(33,22,15,0.32)",
});

const { width: SW, height: SH } = Dimensions.get("window");
const CARD_W = Math.min(SW - 40, 440);

// ── Component ─────────────────────────────────────────────────────────────────
export default function AddressModal({
  visible,
  initialValue = "",
  initialOrderType = "DELIVERY",
  onClose,
  onSelect,
}: AddressModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const C = React.useMemo(() => buildColors(palette), [palette]);
  const s = React.useMemo(() => makeStyles(C), [C]);
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Delivery state
  const [input, setInput]               = useState(initialValue);
  const [predictions, setPredictions]   = useState<Prediction[]>([]);
  const [loadingPred, setLoadingPred]   = useState(false);
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(null);
  const [confirmedCoords, setConfirmedCoords]   = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError]               = useState<string | null>(null);

  // Pickup state
  const [cities, setCities]     = useState<CityOption[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [selectedCity, setSelectedCity]   = useState<CityOption | null>(null);

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionToken  = useRef(makeToken());
  const fadeAnim      = useRef(new Animated.Value(0)).current;
  const scaleAnim     = useRef(new Animated.Value(0.92)).current;
  const inputContainerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  const measureAnchor = () => {
    inputContainerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  // ── Open / close animations ─────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      // Reset state
      setInput(initialValue);
      setOrderType(initialOrderType);
      setPredictions([]);
      setError(null);
      setConfirmedAddress(null);
      setConfirmedCoords(null);
      setSelectedCity(null);
      sessionToken.current = makeToken();

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 280 }),
      ]).start();

      // Pre-fetch cities for pickup mode
      fetchCities();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.92, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Fetch cities ─────────────────────────────────────────────────────────────
  const fetchCities = async () => {
    if (cities.length > 0) return; // already fetched
    setLoadingCities(true);
    try {
      const res = await fetch(`${API_URL}/api/cities`);
      const data = await res.json();
      const list: CityOption[] = (Array.isArray(data) ? data : [])
        .filter((c: any) => c.isActive && c.deliveryMode !== "ONLY_DELIVERY")
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          deliveryMode: c.deliveryMode,
        }));
      setCities(list);
    } catch {
      // Ignore — show empty state
    } finally {
      setLoadingCities(false);
    }
  };

  // ── Address autocomplete (via backend proxy) ─────────────────────────────────
  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setLoadingPred(true);
    try {
      const res = await fetch(`${API_URL}/api/places/autocomplete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, sessiontoken: sessionToken.current }),
      });
      const data = await res.json();
      setPredictions(data.predictions || []);
    } catch {
      setPredictions([]);
    } finally {
      setLoadingPred(false);
    }
  }, []);

  const handleInputChange = (text: string) => {
    setInput(text);
    setConfirmedAddress(null);
    setConfirmedCoords(null);
    setError(null);
    measureAnchor();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(text), 320);
  };

  // ── Geocode selection ─────────────────────────────────────────────────────────
  const handleSelectPrediction = async (pred: Prediction) => {
    setPredictions([]);
    setInput(pred.description);
    setLoadingPred(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/places/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: pred.place_id, sessiontoken: sessionToken.current }),
      });
      const data = await res.json();
      if (data.location) {
        setConfirmedCoords(data.location);
        setConfirmedAddress(pred.description);
        sessionToken.current = makeToken(); // rotate token
      } else {
        setError("Kunde inte hämta koordinater. Försök igen.");
      }
    } catch {
      setError("Nätverksfel. Kontrollera uppkopplingen.");
    } finally {
      setLoadingPred(false);
    }
  };

  // ── Confirm ──────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (orderType === "PICKUP") {
      if (!selectedCity) { setError("Välj en stad för avhämtning."); return; }
      onSelect(selectedCity.name, "PICKUP");
      onClose();
      return;
    }
    // DELIVERY
    if (!input.trim()) { setError("Ange din leveransadress."); return; }
    if (!confirmedCoords) { setError("Välj en adress från listan för att bekräfta koordinaterna."); return; }
    onSelect(confirmedAddress || input.trim(), "DELIVERY", confirmedCoords);
    onClose();
  };

  const street = (d: string) => d.split(",")[0];
  const rest   = (d: string) => d.split(",").slice(1).join(",").trim();

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.overlay, opacity: fadeAnim }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Centered card */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Math.max(insets.bottom - 6, 0)}
        style={{ flex: 1 }}
      >
        <View
          style={[
            s.outer,
            keyboardVisible && {
              justifyContent: "flex-start",
              paddingTop: insets.top + 24,
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View style={[s.card, { width: CARD_W, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}> 

          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.headerSub}>{t('addressModal.beforeOrder')}</Text>
              <Text style={s.headerTitle}>
                {orderType === "DELIVERY" ? t('addressModal.deliveryTitle') : t('addressModal.pickupTitle')}
              </Text>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={17} color={C.muted} />
            </Pressable>
          </View>

          {/* Toggle */}
          <View style={s.toggle}>
            {(["DELIVERY", "PICKUP"] as OrderType[]).map((type) => (
              <Pressable
                key={type}
                onPress={() => { setOrderType(type); setError(null); }}
                style={[s.toggleBtn, orderType === type && s.toggleBtnActive]}
              >
                <Ionicons
                  name={type === "DELIVERY" ? "bicycle-outline" : "storefront-outline"}
                  size={14}
                  color={orderType === type ? "#000" : C.muted}
                />
                <Text style={[s.toggleTxt, orderType === type && s.toggleTxtActive]}>
                  {type === "DELIVERY" ? t('addressModal.delivery') : t('addressModal.pickup')}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── DELIVERY: address input ── */}
          {orderType === "DELIVERY" && (
            <>
              <View
                ref={inputContainerRef}
                onLayout={measureAnchor}
                style={[
                  s.inputRow,
                  error ? s.inputRowErr : confirmedCoords ? s.inputRowOk : {},
                ]}
              >
                <Ionicons
                  name={confirmedCoords ? "checkmark-circle" : "location"}
                  size={18}
                  color={confirmedCoords ? C.green : C.gold}
                />
                <TextInput
                  style={s.textInput}
                  value={input}
                  onChangeText={handleInputChange}
                  placeholder={t('addressModal.inputPlaceholder')}
                  placeholderTextColor={C.muted}
                  autoFocus
                  returnKeyType="search"
                  onFocus={measureAnchor}
                  onSubmitEditing={() => predictions.length === 0 && handleConfirm()}
                />
                {loadingPred
                  ? <ActivityIndicator size="small" color={C.gold} />
                  : input.length > 0 && (
                    <Pressable onPress={() => { setInput(""); setPredictions([]); setConfirmedCoords(null); }} hitSlop={8}>
                      <Ionicons name="close-circle" size={17} color={C.muted} />
                    </Pressable>
                  )
                }
              </View>

              {confirmedCoords && !error && (
                <View style={s.badge}>
                  <Ionicons name="checkmark-circle" size={13} color={C.green} />
                  <Text style={[s.badgeTxt, { color: C.green }]}>{t('addressModal.verified')}</Text>
                </View>
              )}
            </>
          )}

          {/* ── PICKUP: city dropdown ── */}
          {orderType === "PICKUP" && (
            <>
              {loadingCities ? (
                <View style={s.cityLoading}>
                  <ActivityIndicator size="small" color={C.gold} />
                  <Text style={s.cityLoadingTxt}>{t('addressModal.loadingCities')}</Text>
                </View>
              ) : cities.length === 0 ? (
                <View style={s.cityEmpty}>
                  <Text style={s.cityEmptyTxt}>{t('addressModal.noCities')}</Text>
                </View>
              ) : (
                <ScrollView style={s.cityList} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {cities.map((city, idx) => (
                    <Pressable
                      key={city.id}
                      onPress={() => { setSelectedCity(city); setError(null); }}
                      style={({ pressed }) => [
                        s.cityItem,
                        idx < cities.length - 1 && s.cityItemBorder,
                        selectedCity?.id === city.id && s.cityItemSelected,
                        pressed && s.cityItemPress,
                      ]}
                    >
                      <View style={[
                        s.cityRadio,
                        selectedCity?.id === city.id && s.cityRadioActive,
                      ]}>
                        {selectedCity?.id === city.id && (
                          <View style={s.cityRadioDot} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cityName, selectedCity?.id === city.id && { color: C.goldDark }]}>
                          {city.name}
                        </Text>
                        <Text style={s.cityMode}>
                          {city.deliveryMode === "ALL" ? t('addressModal.mode.both') : t('addressModal.mode.pickupOnly')}
                        </Text>
                      </View>
                      <Ionicons
                        name="storefront-outline"
                        size={16}
                          color={selectedCity?.id === city.id ? C.goldDark : C.muted}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {selectedCity && (
                <View style={s.badge}>
                  <Ionicons name="checkmark-circle" size={13} color={C.green} />
                  <Text style={[s.badgeTxt, { color: C.green }]}>{t('addressModal.citySelected', { city: selectedCity.name })}</Text>
                </View>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={13} color={C.red} />
              <Text style={s.errorTxt}>{error}</Text>
            </View>
          )}

          {/* Hint */}
          <Text style={s.hint}>
            {orderType === "DELIVERY" ? t('addressModal.deliveryHint') : t('addressModal.pickupHint')}
          </Text>

          {/* Confirm */}
          <Pressable
            style={({ pressed }) => [s.confirmBtn, pressed && { opacity: 0.85 }]}
            onPress={handleConfirm}
          >
            <Text style={s.confirmTxt}>
              {orderType === "DELIVERY" ? t('addressModal.confirmDelivery') : t('addressModal.confirmPickup')}
            </Text>
            <Ionicons name="arrow-forward" size={19} color="#000" />
          </Pressable>

          </Animated.View>
        </View>
      </KeyboardAvoidingView>

      {/* Predictions overlay — floats above the modal card so the list isn't clipped */}
      <Modal
        visible={orderType === "DELIVERY" && predictions.length > 0 && anchor !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPredictions([])}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { setPredictions([]); Keyboard.dismiss(); }}
        />
        {anchor && (
          <View
            pointerEvents="box-none"
            style={[
              s.predOverlay,
              {
                top: anchor.y + anchor.height + 6,
                left: anchor.x,
                width: anchor.width,
                maxHeight: Math.max(
                  140,
                  Math.min(360, SH - (anchor.y + anchor.height + 6) - 80),
                ),
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator={false}
            >
              {predictions.map((p, idx) => (
                <Pressable
                  key={p.place_id}
                  style={({ pressed }) => [
                    s.predItem,
                    idx < predictions.length - 1 && s.predItemBorder,
                    pressed && s.predItemPress,
                  ]}
                  onPress={() => handleSelectPrediction(p)}
                >
                  <View style={s.predIcon}>
                    <Ionicons name="location" size={13} color={C.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.predStreet} numberOfLines={1}>{street(p.description)}</Text>
                    <Text style={s.predRest}   numberOfLines={1}>{rest(p.description)}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </Modal>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const makeStyles = (C: ReturnType<typeof buildColors>) => StyleSheet.create({
  // Centered layout
  outer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
    padding: 22,
    gap: 14,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 12,
    maxHeight: "90%",
  },

  // Header
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerSub: {
    fontSize: 8, fontWeight: "900", letterSpacing: 2.5,
    color: C.goldDark, textTransform: "uppercase", marginBottom: 3,
  },
  headerTitle: {
    fontSize: 20, fontWeight: "900", letterSpacing: -0.4,
    color: C.text, textTransform: "uppercase",
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },

  // Toggle
  toggle: {
    flexDirection: "row", gap: 6, padding: 4,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
  },
  toggleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 9, borderRadius: 10,
  },
  toggleBtnActive: {
    backgroundColor: C.gold,
    shadowColor: C.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  toggleTxt: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8, color: C.muted, textTransform: "uppercase" },
  toggleTxtActive: { color: "#000" },

  // Delivery input
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.surface, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1.5, borderColor: C.border,
  },
  inputRowErr: { borderColor: "rgba(239,68,68,0.38)" },
  inputRowOk:  { borderColor: "rgba(16,185,129,0.32)" },
  textInput: {
    flex: 1, color: C.text, fontSize: 14,
    fontWeight: "700", padding: 0, margin: 0,
  },

  // Badge (confirmed / selected)
  badge: {
    flexDirection: "row", alignItems: "center", gap: 7,
    padding: 10, borderRadius: 12,
    backgroundColor: C.greenBg, borderWidth: 1, borderColor: "rgba(16,185,129,0.2)",
  },
  badgeTxt: { flex: 1, fontSize: 11, fontWeight: "700" },

  // Predictions overlay (rendered via portal Modal so it isn't clipped by the card)
  predOverlay: {
    position: "absolute",
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 16,
  },
  predItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  predItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  predItemPress: { backgroundColor: "rgba(217,176,85,0.1)" },
  predIcon: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: C.goldDim, alignItems: "center", justifyContent: "center",
  },
  predStreet: { color: C.text, fontSize: 13, fontWeight: "800", marginBottom: 1 },
  predRest:   { color: C.dim,  fontSize: 11, fontWeight: "600" },

  // City dropdown
  cityList: {
    maxHeight: 240, backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: "hidden",
  },
  cityItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  cityItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  cityItemSelected: { backgroundColor: "rgba(217,176,85,0.14)" },
  cityItemPress: { backgroundColor: "rgba(217,176,85,0.1)" },
  cityRadio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: C.muted,
    alignItems: "center", justifyContent: "center",
  },
  cityRadioActive: { borderColor: C.gold },
  cityRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.gold },
  cityName: { color: C.text, fontSize: 14, fontWeight: "800" },
  cityMode: { color: C.dim, fontSize: 10, fontWeight: "600", marginTop: 1 },
  cityLoading: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 20,
  },
  cityLoadingTxt: { color: C.muted, fontSize: 12, fontWeight: "700" },
  cityEmpty: { paddingVertical: 18, alignItems: "center" },
  cityEmptyTxt: { color: C.muted, fontSize: 12, fontWeight: "700" },

  // Error
  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 7,
    padding: 11, borderRadius: 12,
    backgroundColor: C.redBg, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)",
  },
  errorTxt: { flex: 1, color: C.red, fontSize: 12, fontWeight: "700" },

  // Hint
  hint: {
    color: C.muted, fontSize: 10, fontWeight: "600",
    textAlign: "center", lineHeight: 14,
  },

  // Confirm button
  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 22, paddingVertical: 16,
    backgroundColor: C.gold, borderRadius: 20,
    shadowColor: C.gold, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8,
  },
  confirmTxt: {
    color: "#000", fontSize: 13, fontWeight: "900",
    letterSpacing: 1.8, textTransform: "uppercase",
  },
});
