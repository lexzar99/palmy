import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TextInput, Pressable, Platform, ScrollView, Animated, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/useAppStore';
import { api, getImageUrl } from '../lib/api';
import { palette, styles } from '../constants/theme';
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
}: {
  product: MenuProduct | null;
  address: string;
  orderType: OrderType;
  forceHide?: boolean;
  onClose: () => void;
  onAdd: (payload: { quantity: number; note?: string; extras: CartItem["extras"] }) => void;
  editMode?: boolean;
  initialQuantity?: number;
  initialExtras?: CartItem["extras"];
  initialNote?: string;
}) {
  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const [note, setNote] = useState(initialNote ?? "");
  const [extras, setExtras] = useState<CartItem["extras"]>(initialExtras ?? []);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const dislikedIngredients = useAppStore((s) => s.dislikedIngredients || []);

  const matchedIngredients = dislikedIngredients.filter(
    (ing) =>
      product?.description?.toLowerCase().includes(ing.toLowerCase()) ||
      product?.name?.toLowerCase().includes(ing.toLowerCase())
  );

  const orderedGroups = useMemo(
    () => [...(product?.extraGroups || [])].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [product],
  );

  const getExtraPrice = useCallback((extra: MenuExtra) => extra.priceAddon ?? extra.price ?? 0, []);

  const getSelectionCount = useCallback(
    (groupId: string) => extras.filter((item: any) => item.groupId === groupId).length,
    [extras],
  );

  const getGroupHelperText = useCallback((group: MenuExtraGroup) => {
    const min = group.minSelections || 0;
    const max = group.maxSelections || 0;

    if (min > 0 && max > 0 && min === max) return `Välj ${max} alternativ`;
    if (min > 0 && max > 0) return `Välj ${min}-${max} alternativ`;
    if (min > 0) return `Välj minst ${min}`;
    if (max > 1) return `Välj upp till ${max}`;
    if (group.type === "RADIO") return "Välj 1 alternativ";
    return group.required ? "Måste väljas" : "Valfritt";
  }, []);

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
    product.extraGroups?.forEach((group) => {
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
  }, [getExtraPrice, product, editMode, initialQuantity, initialNote, initialExtras]);

  if (!product) return null;

  const extrasPrice = extras.reduce((sum: number, extra: any) => sum + extra.price, 0);
  const totalPrice = (product.price + extrasPrice) * quantity;

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

      if (group.required && selectedInGroup.length === 0) {
        setSelectionError(`Välj ett alternativ i ${group.name.toLowerCase()}.`);
        return;
      }

      if (selectedInGroup.length < (group.minSelections || 0)) {
        setSelectionError(`${group.name} kräver minst ${group.minSelections} val.`);
        return;
      }

      if (selectedInGroup.length > (group.maxSelections || 99)) {
        setSelectionError(`${group.name} tillåter högst ${group.maxSelections} val.`);
        return;
      }
    }

    let finalNote = note.trim();
    if (matchedIngredients.length > 0) {
      const prefText = matchedIngredients.map((i) => `UTAN ${i.toUpperCase()}`).join(", ");
      finalNote = finalNote ? `${finalNote} (${prefText})` : prefText;
    }

    onAdd({ quantity, note: finalNote || undefined, extras });
  };

  return (
    <Modal visible={!!product && !forceHide} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, styles.productModalBackdrop]}>
        <Pressable style={styles.productModalScrim} onPress={onClose} />
        <View style={styles.productModalSheet}>
          <View style={styles.productModalHandle} />
          <Pressable style={styles.productModalCloseButton} onPress={onClose}>
            <Ionicons name="close" size={20} color={palette.text} />
          </Pressable>

          <ScrollView style={styles.productModalScroll} contentContainerStyle={styles.productModalContent} showsVerticalScrollIndicator={false}>
            {product.imageUrl ? (
              <View style={styles.productHeroCard}>
                <Image source={{ uri: getImageUrl(product.imageUrl) }} style={styles.productHeroImage} />
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.1)", "rgba(0,0,0,0.7)"]} style={styles.productHeroOverlay} />
                <View style={styles.productHeroContent}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <View style={styles.productHeroPriceChip}>
                      <Text style={styles.productHeroPriceChipText}>Från {product.price} kr</Text>
                    </View>
                    {matchedIngredients.length > 0 && (
                      <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="alert-circle" size={14} color="#dc2626" />
                        <Text style={{ color: "#dc2626", fontSize: 10, fontWeight: "900" }}>{matchedIngredients[0].toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.productModalTitle}>{product.name}</Text>
                  {!!product.description && <Text style={styles.productModalDescription}>{product.description}</Text>}
                </View>
              </View>
            ) : (
              <View style={{ padding: 24, paddingBottom: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <View style={styles.productHeroPriceChip}>
                    <Text style={styles.productHeroPriceChipText}>Från {product.price} kr</Text>
                  </View>
                  {matchedIngredients.length > 0 && (
                    <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="alert-circle" size={14} color="#dc2626" />
                      <Text style={{ color: "#dc2626", fontSize: 10, fontWeight: "900" }}>INNEHÅLLER {matchedIngredients[0].toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.productModalTitle}>{product.name}</Text>
                {!!product.description && <Text style={styles.productModalDescription}>{product.description}</Text>}
              </View>
            )}

            <View style={styles.productMetaCard}>
              <Ionicons name="location-outline" size={18} color={palette.gold} />
              <Text style={styles.productMetaText} numberOfLines={2}>
                {address ? `Leverans till ${address}` : "Lägg till adress på startsidan om du vill kontrollera leveransen."}
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
                          {group.required ? "Måste väljas" : "Valfritt"}
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
                                {extraPrice > 0 ? `+${extraPrice} kr` : "Ingår"}
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
              <Text style={styles.productNoteLabel}>Önskemål</Text>
              <TextInput
                style={styles.productNoteInput}
                multiline
                placeholder="Allergier eller speciella önskemål?"
                placeholderTextColor={palette.muted}
                value={note}
                onChangeText={setNote}
              />
            </View>

            {!!selectionError && (
              <View style={styles.productSelectionError}>
                <Ionicons name="alert-circle-outline" size={18} color="#fda4af" />
                <Text style={styles.productSelectionErrorText}>{selectionError}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.productModalFooter}>
            <View style={styles.productFooterSummaryRow}>
              <View>
                <Text style={styles.productFooterLabel}>Totalt</Text>
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
              style={[styles.productAddButton, !address && { backgroundColor: "#E2C06C" }]}
              onPress={handleAddToCart}
            >
              <View style={styles.productAddButtonContent}>
                <View style={styles.productAddButtonIconWrap}>
                  <Ionicons name={!address ? "location-outline" : "bag-handle-outline"} size={18} color="#000" />
                </View>
                <View>
                  <Text style={styles.productAddButtonLabel}>
                    {!address ? (orderType === "DELIVERY" ? "Ange adress" : "Välj stad") : "Lägg i kassen"}
                  </Text>
                  <Text style={styles.productAddButtonSubLabel}>
                    {!address ? "Krävs för att fortsätta" : "Klar att beställa"}
                  </Text>
                </View>
              </View>
              <Text style={styles.productAddButtonPrice}>{totalPrice} kr</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
