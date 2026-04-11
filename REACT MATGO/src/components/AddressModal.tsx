/**
 * AddressModal — React Native (Expo)
 * Mirrors the web app AddressModal design: dark card, gold accents,
 * DELIVERY / HÄMTNING toggle, Google Places autocomplete via session tokens.
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
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || "";
const API_BASE = process.env.EXPO_PUBLIC_API_URL || "";

// Use session tokens for billing grouping (one autocomplete session = 1 billable event)
const generateSessionToken = () =>
  Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

export type OrderType = "DELIVERY" | "PICKUP";

interface PlacePrediction {
  description: string;
  place_id: string;
}

interface AddressModalProps {
  visible: boolean;
  initialValue?: string;
  initialOrderType?: OrderType;
  onClose: () => void;
  onSelect: (
    address: string,
    orderType: OrderType,
    coords?: { lat: number; lng: number }
  ) => void;
}

const COLORS = {
  bg: "#0d0c14",
  card: "#12101c",
  surface: "#1a1729",
  border: "#2a2438",
  borderActive: "#d4a017",
  gold: "#d4a017",
  goldLight: "#e7b24b",
  text: "#f5f3ef",
  textMuted: "#6b6480",
  textDim: "#9891a8",
  emerald: "#10b981",
  emeraldBg: "#10b98115",
  red: "#ef4444",
  redBg: "#ef444415",
  overlay: "rgba(0,0,0,0.88)",
};

export default function AddressModal({
  visible,
  initialValue = "",
  initialOrderType = "DELIVERY",
  onClose,
  onSelect,
}: AddressModalProps) {
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType);
  const [input, setInput] = useState(initialValue);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionToken = useRef(generateSessionToken());
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      setInput(initialValue);
      setOrderType(initialOrderType);
      setPredictions([]);
      setError(null);
      setSelectedCoords(null);
      setSelectedAddress(null);
      sessionToken.current = generateSessionToken();

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(60);
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&components=country:se&language=sv&sessiontoken=${sessionToken.current}&key=${MAPS_KEY}`
      );
      const data = await response.json();
      setPredictions(data.predictions || []);
    } catch {
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (text: string) => {
    setInput(text);
    setSelectedAddress(null);
    setSelectedCoords(null);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(text), 320);
  };

  const handleSelect = async (prediction: PlacePrediction) => {
    setPredictions([]);
    setInput(prediction.description);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=geometry&sessiontoken=${sessionToken.current}&key=${MAPS_KEY}`
      );
      const data = await response.json();
      const loc = data.result?.geometry?.location;
      if (loc) {
        setSelectedCoords({ lat: loc.lat, lng: loc.lng });
        setSelectedAddress(prediction.description);
        // Rotate token after completing a selection
        sessionToken.current = generateSessionToken();
      } else {
        setError("Kunde inte hämta koordinater för adressen.");
      }
    } catch {
      setError("Något gick fel. Försök igen.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!input.trim()) {
      setError(
        orderType === "DELIVERY" ? "Ange din leveransadress." : "Ange din stad."
      );
      return;
    }
    if (orderType === "DELIVERY" && !selectedCoords) {
      setError("Välj en adress från listan så vi kan kontrollera leveranszonen.");
      return;
    }
    onSelect(selectedAddress || input.trim(), orderType, selectedCoords ?? undefined);
    onClose();
  };

  const streetPart = (desc: string) => desc.split(",")[0];
  const restPart = (desc: string) =>
    desc.split(",").slice(1).join(",").trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.outer}
      >
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Card */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerLabel}>Innan du beställer</Text>
              <Text style={styles.headerTitle}>
                {orderType === "DELIVERY" ? "Din leveransadress" : "Hämtplats"}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* Delivery / Pickup Toggle */}
          <View style={styles.toggle}>
            {(["DELIVERY", "PICKUP"] as OrderType[]).map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  setOrderType(type);
                  setError(null);
                }}
                style={[
                  styles.toggleBtn,
                  orderType === type && styles.toggleBtnActive,
                ]}
              >
                <Ionicons
                  name={type === "DELIVERY" ? "bicycle" : "storefront"}
                  size={14}
                  color={orderType === type ? "#fff" : COLORS.textMuted}
                />
                <Text
                  style={[
                    styles.toggleText,
                    orderType === type && styles.toggleTextActive,
                  ]}
                >
                  {type === "DELIVERY" ? "Leverans" : "Avhämtning"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Address Input */}
          <View
            style={[
              styles.inputWrap,
              error ? styles.inputWrapError : selectedCoords ? styles.inputWrapSuccess : {},
            ]}
          >
            <Ionicons
              name={selectedCoords ? "checkmark-circle" : "location"}
              size={18}
              color={selectedCoords ? COLORS.emerald : COLORS.gold}
            />
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={handleChange}
              placeholder={
                orderType === "DELIVERY"
                  ? "Gatuadress, postnummer..."
                  : "Stad eller område..."
              }
              placeholderTextColor={COLORS.textMuted}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => predictions.length === 0 && handleConfirm()}
            />
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.gold} />
            ) : input.length > 0 ? (
              <Pressable
                onPress={() => {
                  setInput("");
                  setPredictions([]);
                  setSelectedCoords(null);
                  setSelectedAddress(null);
                }}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={14} color={COLORS.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Address confirmed badge */}
          {selectedCoords && !error && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={14} color={COLORS.emerald} />
              <Text style={styles.successText}>
                Adress bekräftad — kontrollerar leveranszon...
              </Text>
            </View>
          )}

          {/* Predictions */}
          {predictions.length > 0 && (
            <ScrollView
              style={styles.predictions}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {predictions.map((pred, idx) => (
                <Pressable
                  key={pred.place_id}
                  style={({ pressed }) => [
                    styles.predItem,
                    idx < predictions.length - 1 && styles.predItemBorder,
                    pressed && styles.predItemPressed,
                  ]}
                  onPress={() => handleSelect(pred)}
                >
                  <View style={styles.predIcon}>
                    <Ionicons name="location" size={14} color={COLORS.gold} />
                  </View>
                  <View style={styles.predText}>
                    <Text style={styles.predStreet} numberOfLines={1}>
                      {streetPart(pred.description)}
                    </Text>
                    <Text style={styles.predRest} numberOfLines={1}>
                      {restPart(pred.description)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Hint text */}
          <Text style={styles.hint}>
            Vi visar restauranger som levererar till din adress. Zonerna uppdateras löpande.
          </Text>

          {/* Confirm button */}
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.88 }]}
            onPress={handleConfirm}
          >
            <Text style={styles.confirmText}>
              {orderType === "DELIVERY" ? "Visa restauranger" : "Hitta avhämtning"}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: COLORS.overlay,
  },
  card: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    gap: 14,
    // Subtle shadow upward
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 3,
    textTransform: "uppercase",
    color: COLORS.gold,
    marginBottom: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    color: COLORS.text,
    textTransform: "uppercase",
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggle: {
    flexDirection: "row",
    gap: 8,
    padding: 5,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 11,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.textMuted,
  },
  toggleTextActive: {
    color: "#fff",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  inputWrapError: {
    borderColor: COLORS.red + "80",
  },
  inputWrapSuccess: {
    borderColor: COLORS.emerald + "60",
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    padding: 0,
    margin: 0,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: COLORS.redBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.red + "30",
  },
  errorText: {
    flex: 1,
    color: COLORS.red,
    fontSize: 12,
    fontWeight: "700",
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    backgroundColor: COLORS.emeraldBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.emerald + "30",
  },
  successText: {
    flex: 1,
    color: COLORS.emerald,
    fontSize: 11,
    fontWeight: "700",
  },
  predictions: {
    maxHeight: 280,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  predItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  predItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  predItemPressed: {
    backgroundColor: COLORS.border,
  },
  predIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.gold + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  predText: {
    flex: 1,
  },
  predStreet: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  predRest: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "600",
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 15,
    textAlign: "center",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: COLORS.gold,
    borderRadius: 22,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  confirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
