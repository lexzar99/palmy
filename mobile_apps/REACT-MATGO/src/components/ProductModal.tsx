import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, Platform, ScrollView, Animated, PanResponder, StyleSheet, Image, Modal, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { api, getImageUrl } from '../lib/api';
import { useSharedStyles, useTheme } from '../theme';
import { Header, PrimaryButton } from '../components/ui';
import type { MenuProduct, OrderType, CartItem, MenuExtra, MenuExtraGroup } from '../types';

export default function ProductModal({
  product,
  address,
  orderType,
  forceHide,
  onClose,
  onAdd,
  editMode,
  initialQuantity,
  initialExtras,
  initialNote,
  bogoFreeFromDealId,
  bogoDealTitle,
  bogoRewardCategoryName,
  bogoExcludedExtraIds,
}: {
  product: MenuProduct | null;
  address: string;
  orderType: OrderType;
  forceHide?: boolean;
  onClose: () => void;
  onAdd: (payload: { quantity: number; note?: string; extras: CartItem["extras"]; bogoFreeFromDealId?: string }) => void;
  editMode?: boolean;
  initialQuantity?: number;
  initialExtras?: CartItem["extras"];
  initialNote?: string;
  /** BOGO: sätts av BogoPickerModal. Baspriset nollas, extras betalas normalt. */
  bogoFreeFromDealId?: string;
  bogoDealTitle?: string;
  bogoRewardCategoryName?: string | null;
  /** Extras (Extra.id) som admin har blockerat för gratisvaran — filtreras bort innan rendering. */
  bogoExcludedExtraIds?: string[];
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const modalScrollRef = useRef<ScrollView | null>(null);
  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const [note, setNote] = useState(initialNote ?? "");
  const [extras, setExtras] = useState<CartItem["extras"]>(initialExtras ?? []);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // För BOGO-gratisvara: filtrera bort tillval som admin har blockerat på
  // dealen (t.ex. "Familjepizza-storlek"). Vi filtrerar både på extra-nivå
  // och tar bort hela grupper som blivit tomma OCH inte krävs. Matchar
  // apps/web/components/ProductModal.tsx line 45-53.
  const excludedExtraIdSet = useMemo(
    () => (bogoFreeFromDealId && bogoExcludedExtraIds && bogoExcludedExtraIds.length > 0
      ? new Set(bogoExcludedExtraIds)
      : null),
    [bogoFreeFromDealId, bogoExcludedExtraIds],
  );

  const filteredGroups = useMemo(() => {
    const base = product?.extraGroups || [];
    if (!excludedExtraIdSet || excludedExtraIdSet.size === 0) return base;
    return base
      .map((group) => ({
        ...group,
        extras: (group.extras || []).filter((extra) => !excludedExtraIdSet.has(extra.id)),
      }))
      .filter((group) => group.extras.length > 0 || group.required);
  }, [product, excludedExtraIdSet]);

  const orderedGroups = useMemo(
    () => [...filteredGroups].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [filteredGroups],
  );

  const translateY = useRef(new Animated.Value(0)).current;
  const scrimOpacity = translateY.interpolate({ inputRange: [0, 300], outputRange: [1, 0], extrapolate: 'clamp' });

  // Reset position whenever modal opens
  useEffect(() => {
    if (product) translateY.setValue(0);
  }, [product, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          Animated.timing(translateY, { toValue: 600, duration: 220, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    })
  ).current;

  const getExtraPrice = useCallback((extra: MenuExtra) => extra.priceAddon ?? extra.price ?? 0, []);

  const getSelectionCount = useCallback(
    (groupId: string) => extras.filter((item: any) => item.groupId === groupId).length,
    [extras],
  );

  const getGroupHelperText = useCallback((group: MenuExtraGroup) => {
    const min = group.minSelections || 0;
    const max = group.maxSelections || 0;

    if (min > 0 && max > 0 && min === max) return t('product.chooseExact', { count: max });
    if (min > 0 && max > 0) return t('product.chooseBetween', { min, max });
    if (min > 0) return t('product.chooseMin', { count: min });
    if (max > 1) return t('product.chooseUpTo', { count: max });
    if (group.type === "RADIO") return t('product.chooseOne');
    return group.required ? t('product.required') : t('product.optional');
  }, [t]);

  useEffect(() => {
    if (!product) {
      setQuantity(1);
      setNote("");
      setExtras([]);
      setSelectionError(null);
      return;
    }

    // Edit-läge: behåll initiala värden från cart-raden utan att skriva över med defaults.
    if (editMode) {
      setQuantity(initialQuantity ?? 1);
      setNote(initialNote ?? "");
      setExtras(initialExtras ?? []);
      setSelectionError(null);
      return;
    }

    const defaults: CartItem["extras"] = [];
    // Hoppa över BOGO-uteslutna extras även när vi sätter defaults — annars
    // skulle en blockerad "default"-extra ligga kvar i state utan att synas.
    filteredGroups.forEach((group) => {
      group.extras.forEach((extra) => {
        if (extra.isDefault) {
          defaults.push({
            groupId: group.id,
            groupName: group.name,
            extraId: extra.id,
            name: extra.name,
            price: getExtraPrice(extra),
          });
        }
      });
    });

    setQuantity(1);
    setNote("");
    setExtras(defaults);
    setSelectionError(null);
  }, [getExtraPrice, product, editMode, initialQuantity, initialNote, initialExtras, filteredGroups]);

  if (!product) return null;

  const extrasPrice = extras.reduce((sum: number, extra: any) => sum + extra.price, 0);
  // BOGO-gratisvara — baspris är alltid 0 (extras betalas normalt). Matchar
  // apps/web/components/ProductModal.tsx line 133.
  const basePrice = bogoFreeFromDealId
    ? 0
    : product.discountActive
      ? (product.discountPrice || Math.round(product.price - product.price * ((product.discountPercent || 0) / 100)))
      : product.price;
  const totalPrice = (basePrice + extrasPrice) * quantity;

  const toggleExtra = (group: MenuExtraGroup, extra: MenuExtra) => {
    setSelectionError(null);

    setExtras((current: any) => {
      const exists = current.some((item: any) => item.extraId === extra.id);

      if (group.type === "RADIO") {
        if (exists) return current;
        return [
          ...current.filter((item: any) => item.groupId !== group.id),
          {
            groupId: group.id,
            groupName: group.name,
            extraId: extra.id,
            name: extra.name,
            price: getExtraPrice(extra),
          },
        ];
      }

      if (exists) {
        return current.filter((item: any) => item.extraId !== extra.id);
      }

      const countInGroup = current.filter((item: any) => item.groupId === group.id).length;
      if (countInGroup >= (group.maxSelections || 99)) {
        return current;
      }

      return [
        ...current,
        {
          groupId: group.id,
          groupName: group.name,
          extraId: extra.id,
          name: extra.name,
          price: getExtraPrice(extra),
        },
      ];
    });
  };

  const handleAddToCart = () => {
    for (const group of orderedGroups) {
      const selectedInGroup = extras.filter((item: any) => item.groupId === group.id);

      // En obligatorisk grupp kan ha ALLA sina extras blockerade av BOGO.
      // Då kan kunden inte uppfylla kravet — vi hoppar över valideringen
      // för att inte fastna i ett ogiltigt tillstånd. Matchar web line 157.
      if (group.required && selectedInGroup.length === 0) {
        if ((group.extras || []).length === 0) continue;
        setSelectionError(t('product.validationRequired', { group: group.name.toLowerCase() }));
        return;
      }

      if (selectedInGroup.length < (group.minSelections || 0) && (group.extras || []).length > 0) {
        setSelectionError(t('product.validationMin', { group: group.name, count: group.minSelections }));
        return;
      }

      if (selectedInGroup.length > (group.maxSelections || 99)) {
        setSelectionError(t('product.validationMax', { group: group.name, count: group.maxSelections }));
        return;
      }
    }

    const finalNote = note.trim();
    onAdd({
      quantity,
      note: finalNote || undefined,
      extras,
      ...(bogoFreeFromDealId ? { bogoFreeFromDealId } : {}),
    });
  };

  const handleNoteFocus = () => {
    requestAnimationFrame(() => {
      modalScrollRef.current?.scrollToEnd({ animated: true });
    });
    setTimeout(() => {
      modalScrollRef.current?.scrollToEnd({ animated: true });
    }, 140);
  };

  return (
    <Modal visible={!!product && !forceHide} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Math.max(insets.bottom - 6, 0)}
        style={{ flex: 1 }}
      >
        <View style={[styles.modalBackdrop, styles.productModalBackdrop]}>
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: scrimOpacity }]}>
            <Pressable style={styles.productModalScrim} onPress={onClose} />
          </Animated.View>
          <Animated.View style={[styles.productModalSheet, { transform: [{ translateY }] }]}>
            <View style={styles.productModalHandle} {...panResponder.panHandlers} />
            <Pressable style={styles.productModalCloseButton} onPress={onClose}>
              <Ionicons name="close" size={20} color={palette.text} />
            </Pressable>

            <ScrollView
              ref={modalScrollRef}
              style={styles.productModalScroll}
              contentContainerStyle={styles.productModalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
            {bogoFreeFromDealId && (
              <View
                style={{
                  marginHorizontal: 24,
                  marginTop: 16,
                  marginBottom: 4,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.30)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    backgroundColor: "rgba(16,185,129,0.12)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="gift" size={16} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "#10B981",
                      fontSize: 10,
                      fontWeight: "900",
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    }}
                  >
                    BOGO — Gratis
                  </Text>
                  {!!bogoDealTitle && (
                    <Text
                      style={{
                        color: palette.textSecondary,
                        fontSize: 11,
                        fontWeight: "700",
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {bogoDealTitle}
                    </Text>
                  )}
                </View>
              </View>
            )}
            {product.imageUrl ? (
              <View style={styles.productHeroCard}>
                <Image source={{ uri: getImageUrl(product.imageUrl) }} style={styles.productHeroImage} />
                <LinearGradient colors={["rgba(24,18,12,0.04)", "rgba(24,18,12,0.18)", "rgba(24,18,12,0.72)"]} style={styles.productHeroOverlay} />
                <View style={styles.productHeroContent}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <View style={[styles.productHeroPriceChip, { backgroundColor: "rgba(0,0,0,0.52)", borderColor: "rgba(255,255,255,0.15)" }]}>
                      {product.discountActive ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Text style={[styles.productHeroPriceChipText, { color: "rgba(255,255,255,0.5)", textDecorationLine: "line-through" }]}>{product.price} kr</Text>
                          <Text style={[styles.productHeroPriceChipText, { color: palette.gold }]}>{basePrice} kr</Text>
                        </View>
                      ) : (
                        <Text style={[styles.productHeroPriceChipText, { color: "#fff" }]}>{t('product.from', { price: product.price })}</Text>
                      )}
                    </View>
                  </View>
                  <LinearGradient
                    colors={["rgba(24,18,12,0)", "rgba(24,18,12,0.28)", "rgba(24,18,12,0.88)"]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.productHeroTextGradient}
                  >
                    <Text style={styles.productHeroTitle}>{product.name}</Text>
                    {!!product.description && <Text style={styles.productHeroDescription}>{product.description}</Text>}
                  </LinearGradient>
                </View>
              </View>
            ) : (
              <View style={{ padding: 24, paddingBottom: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <View style={styles.productHeroPriceChip}>
                    {product.discountActive ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Text style={[styles.productHeroPriceChipText, { textDecorationLine: "line-through", opacity: 0.55 }]}>{product.price} kr</Text>
                        <Text style={[styles.productHeroPriceChipText, { color: palette.gold }]}>{basePrice} kr</Text>
                      </View>
                    ) : (
                      <Text style={styles.productHeroPriceChipText}>{t('product.from', { price: product.price })}</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.productModalTitle}>{product.name}</Text>
                {!!product.description && <Text style={styles.productModalDescription}>{product.description}</Text>}
              </View>
            )}

            <View style={styles.productMetaCard}>
              <Ionicons name="location-outline" size={18} color={palette.gold} />
              <Text style={styles.productMetaText} numberOfLines={2}>
                {address ? t('product.deliveryTo', { address }) : t('product.noAddress')}
              </Text>
            </View>

            {orderedGroups.map((group: any) => {
              const selectionCount = getSelectionCount(group.id);
              return (
                <View key={group.id} style={styles.productGroupCard}>
                  <View style={styles.productGroupHeader}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.productGroupTitle}>{group.name}</Text>
                      <Text style={styles.productGroupDescription}>{group.description || getGroupHelperText(group)}</Text>
                    </View>
                    <View style={styles.productGroupBadgeRow}>
                      <View style={[styles.productGroupBadge, group.required ? styles.productGroupBadgeRequired : styles.productGroupBadgeOptional]}>
                        <Text style={[styles.productGroupBadgeText, group.required ? styles.productGroupBadgeTextRequired : styles.productGroupBadgeTextOptional]}>
                          {group.required ? t('product.required') : t('product.optional')}
                        </Text>
                      </View>
                      {(group.maxSelections || 0) > 1 && (
                        <View style={styles.productGroupCountBadge}>
                          <Text style={styles.productGroupCountText}>{selectionCount}/{group.maxSelections}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.productOptionsList}>
                    {(group.extras || []).map((extra: any) => {
                      const active = extras.some((item: any) => item.extraId === extra.id);
                      const extraPrice = getExtraPrice(extra);
                      const disabled = group.type !== "RADIO" && !active && selectionCount >= (group.maxSelections || 99);

                      return (
                        <Pressable
                          key={extra.id}
                          style={[styles.productOptionCard, active && styles.productOptionCardActive, disabled && styles.productOptionCardDisabled]}
                          onPress={() => toggleExtra(group, extra)}
                          disabled={disabled}
                        >
                          <View style={styles.productOptionMainRow}>
                            <View style={[styles.productOptionIndicator, active && styles.productOptionIndicatorActive]}>
                              {active && <View style={styles.productOptionIndicatorInner} />}
                            </View>
                            <View style={styles.productOptionTextWrap}>
                              <Text style={[styles.productOptionTitle, active && styles.productOptionTitleActive]}>{extra.name}</Text>
                              <Text style={[styles.productOptionMeta, active && styles.productOptionMetaActive]}>
                                {extraPrice > 0 ? `+${extraPrice} kr` : t('product.included')}
                              </Text>
                            </View>
                          </View>
                          {active && <Ionicons name="checkmark" size={18} color={palette.gold} />}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            <View style={styles.productNoteCard}>
              <Text style={styles.productNoteLabel}>{t('product.wishes')}</Text>
              <TextInput
                style={styles.productNoteInput}
                multiline
                placeholder={t('product.wishesPlaceholder')}
                placeholderTextColor={palette.muted}
                value={note}
                onChangeText={setNote}
                onFocus={handleNoteFocus}
              />
            </View>

            {!!selectionError && (
              <View style={styles.productSelectionError}>
                <Ionicons name="alert-circle-outline" size={18} color="#fda4af" />
                <Text style={styles.productSelectionErrorText}>{selectionError}</Text>
              </View>
            )}
            </ScrollView>

            <View style={[styles.productModalFooter, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
              <View style={styles.productFooterSummaryRow}>
                <View>
                  <Text style={styles.productFooterLabel}>{t('product.total')}</Text>
                  <Text style={styles.productFooterValue}>{totalPrice} kr</Text>
                </View>
                <View style={styles.productQuantityCard}>
                  <Pressable onPress={() => setQuantity((current) => Math.max(1, current - 1))} style={styles.productQuantityButton}>
                    <Ionicons name="remove-outline" size={18} color={palette.text} />
                  </Pressable>
                  <Text style={styles.productQuantityValue}>{quantity}</Text>
                  <Pressable onPress={() => setQuantity((current) => current + 1)} style={styles.productQuantityButton}>
                    <Ionicons name="add-outline" size={18} color={palette.text} />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={[
                  styles.productAddButton,
                  !address && { backgroundColor: "#E2C06C" },
                  // BOGO-gratisvara — emerald CTA istället för gold.
                  bogoFreeFromDealId && { backgroundColor: palette.success },
                ]}
                onPress={handleAddToCart}
              >
                <View style={styles.productAddButtonContent}>
                  <View style={styles.productAddButtonIconWrap}>
                    <Ionicons
                      name={!address ? "location-outline" : bogoFreeFromDealId ? "gift" : "bag-handle-outline"}
                      size={18}
                      color={bogoFreeFromDealId ? "#fff" : "#000"}
                    />
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.productAddButtonLabel,
                        bogoFreeFromDealId && { color: "#fff" },
                      ]}
                    >
                      {!address
                        ? t('product.enterAddress')
                        : bogoFreeFromDealId
                          ? "Välj som gratis"
                          : t('product.addToCart')}
                    </Text>
                    <Text
                      style={[
                        styles.productAddButtonSubLabel,
                        bogoFreeFromDealId && { color: "rgba(255,255,255,0.78)" },
                      ]}
                    >
                      {!address
                        ? t('product.addressRequired')
                        : bogoFreeFromDealId
                          ? (extrasPrice > 0 ? `+${extrasPrice * quantity} kr extras` : "Gratis")
                          : t('product.readyToOrder')}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.productAddButtonPrice,
                    bogoFreeFromDealId && { color: "#fff" },
                  ]}
                >
                  {bogoFreeFromDealId && extrasPrice === 0 ? "GRATIS" : `${totalPrice} kr`}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
