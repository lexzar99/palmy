import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore } from "../store/useAppStore";
import { useTheme } from "../theme";
import { getImageUrl } from "../lib/api";
import type { BogoChoice } from "../types";

export type BogoPickerProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  /** Full product data — finns när pickern öppnas från en restaurangsida med
   *  extras. Behövs inte i kassan, där vi lägger till direkt utan extras. */
  extraGroups?: any[];
};

type Props = {
  visible: boolean;
  dealId: string;
  dealTitle: string;
  restaurantId: string;
  restaurantSlug?: string | null;
  rewardCategoryName?: string | null;
  products: BogoPickerProduct[];
  onClose: () => void;
  /** Om satt anropas denna istället för direkt cart-tillägg — förälder öppnar
   *  ProductModal så användaren kan välja extras till sin gratisvara. v1 i RN
   *  använder enbart direkt-tillägg från kassan, men prop:en finns redan för
   *  att matcha web. */
  onSelectProduct?: (product: BogoPickerProduct) => void;
};

/**
 * BogoPickerModal — RN-pendang till apps/web/components/BogoPickerModal.tsx.
 *
 * Bottom-sheet style: slide-up från botten, mörkad backdrop, scrollbar lista
 * av reward-produkter. Tryck på en produkt → lägg till i korgen med
 * `price: 0` och `bogoFreeFromDealId` satt, samt skriv valet till
 * `bogoChoice` i Zustand-storen.
 */
export default function BogoPickerModal({
  visible,
  dealId,
  dealTitle,
  restaurantId,
  restaurantSlug,
  rewardCategoryName,
  products,
  onClose,
  onSelectProduct,
}: Props) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const setBogoChoice = useAppStore((s) => s.setBogoChoice);
  const addItem = useAppStore((s) => s.addItem);

  // Slide-in animation — mimar web's spring-translate på y-axeln.
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          bounciness: 4,
          speed: 14,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset off-screen så nästa öppning animerar in från botten igen
      translateY.setValue(600);
      backdropOpacity.setValue(0);
    }
  }, [visible, translateY, backdropOpacity]);

  const handlePick = (p: BogoPickerProduct) => {
    // Om förälder vill hantera extras-val via ProductModal — fortfarande
    // inte implementerat i v1 men prop:en respekteras för framtida bruk.
    if (onSelectProduct) {
      onSelectProduct(p);
      return;
    }
    // Bevarar existerande slug — store.addItem skriver alltid `restaurantSlug`
    // (även om undefined skickas in faller den genom `|| null`), så vi måste
    // explicit läsa nuvarande slug och skicka den vidare.
    const currentSlug = restaurantSlug ?? useAppStore.getState().restaurantSlug ?? null;
    addItem({
      productId: p.id,
      restaurantId,
      restaurantSlug: currentSlug,
      name: p.name,
      price: 0,
      quantity: 1,
      extras: [],
      bogoFreeFromDealId: dealId,
    });
    const choice: BogoChoice = {
      dealId,
      dealTitle,
      rewardCategoryName,
      product: { id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl ?? null },
    };
    setBogoChoice(choice);
    onClose();
  };

  // Web kopia: "Välj din gratis [category]!" — kategorin lowercased om finns.
  const headerTitle = rewardCategoryName
    ? `Välj din gratis ${rewardCategoryName.toLowerCase()}!`
    : "Välj din gratis produkt!";

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: backdropOpacity }]}>
          <Pressable style={[styles.scrim, { backgroundColor: "rgba(15,15,15,0.6)" }]} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.bgSecondary,
              borderColor: palette.borderMuted,
              paddingBottom: Math.max(insets.bottom, 14),
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Drag-handle / pull indicator */}
          <View style={[styles.handle, { backgroundColor: palette.border }]} />

          {/* Header — gift-ikon + BOGO-eyebrow + titel + close-knapp */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}>
              <View
                style={[
                  styles.iconBadge,
                  {
                    backgroundColor: "rgba(16,185,129,0.10)",
                    borderColor: "rgba(16,185,129,0.20)",
                  },
                ]}
              >
                <Ionicons name="gift-outline" size={18} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>BOGO</Text>
                <Text
                  style={[styles.title, { color: palette.textPrimary }]}
                  numberOfLines={2}
                >
                  {headerTitle}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeBtn, { borderColor: palette.borderMuted }]}
              hitSlop={8}
            >
              <Ionicons name="close" size={14} color={palette.muted} />
            </Pressable>
          </View>

          <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={2}>
            {dealTitle} — välj en produkt nedan som du får gratis.
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, gap: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {products.map((p) => {
              const imgSrc = p.imageUrl ? getImageUrl(p.imageUrl) : null;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => handlePick(p)}
                  style={({ pressed }) => [
                    styles.productRow,
                    {
                      backgroundColor: palette.panelMuted,
                      borderColor: palette.border,
                      opacity: pressed ? 0.85 : 1,
                      transform: pressed ? [{ scale: 0.98 }] : undefined,
                    },
                  ]}
                >
                  {imgSrc ? (
                    <Image source={{ uri: imgSrc }} style={styles.productImage} />
                  ) : (
                    <View
                      style={[
                        styles.productImage,
                        {
                          backgroundColor: "rgba(255,255,255,0.04)",
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 20 }}>🍽️</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.productName, { color: palette.textPrimary }]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    <Text
                      style={[
                        styles.productPrice,
                        { color: palette.muted, textDecorationLine: "line-through" },
                      ]}
                    >
                      {Math.round(p.price)} kr
                    </Text>
                  </View>
                  <Text style={styles.freeLabel}>GRATIS</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Skip / hoppa över */}
          <View style={[styles.footer, { borderTopColor: palette.borderMuted }]}>
            <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={[styles.skipLabel, { color: palette.muted }]}>
                Hoppa över — välj senare i kassan
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    flex: 1,
  },
  sheet: {
    width: "100%",
    maxHeight: "85%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: { elevation: 18 },
    }),
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "#10B981",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    textTransform: "uppercase",
    marginTop: 2,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    paddingHorizontal: 22,
    paddingBottom: 14,
    fontSize: 11,
    fontStyle: "italic",
    fontWeight: "600",
  },
  list: {
    flexGrow: 0,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  productImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  productName: {
    fontSize: 13,
    fontWeight: "900",
  },
  productPrice: {
    fontSize: 11,
    marginTop: 2,
  },
  freeLabel: {
    color: "#10B981",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: "center",
  },
  skipLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
    paddingVertical: 10,
  },
});
