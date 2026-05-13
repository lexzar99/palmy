import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { useSharedStyles, useTheme } from '../theme';

type Review = {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  reply: string;
  likedItems?: string[];
  createdAt: string;
};

type ReviewsResponse = {
  averageRating: number;
  totalCount: number;
  distribution?: Record<string, number>;
  reviews: Review[];
};

type SortMode = 'top' | 'recent' | 'low';

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'top', label: 'Bästa först' },
  { value: 'recent', label: 'Senaste' },
  { value: 'low', label: 'Lägst betyg' },
];

const RATING_FILTERS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Alla' },
  { value: 5, label: 'Endast 5★' },
  { value: 4, label: '4★+' },
  { value: 3, label: '3★+' },
];

function formatRelativeDate(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diffDays = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return 'Idag';
  if (diffDays < 2) return 'Igår';
  if (diffDays < 7) return `${diffDays} dagar sedan`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} veckor sedan`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} mån sedan`;
  return `${Math.floor(diffDays / 365)} år sedan`;
}

export default function RestaurantReviewsModal({
  restaurantSlug,
  restaurantName,
  visible,
  onClose,
}: {
  restaurantSlug: string | null;
  restaurantName?: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('top');
  const [minRating, setMinRating] = useState(1);

  useEffect(() => {
    if (!visible || !restaurantSlug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/api/restaurants/${restaurantSlug}/reviews`, { params: { sort, minRating } })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.response?.data?.error ?? 'Kunde inte hämta recensioner');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, restaurantSlug, sort, minRating]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { borderRadius: 34, padding: 24, maxHeight: '88%' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: palette.text, fontSize: 24, fontWeight: '900' }}>RECENSIONER</Text>
              {!!restaurantName && (
                <Text style={{ color: palette.goldDark, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 6 }}>
                  {restaurantName.toUpperCase()}
                </Text>
              )}
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close-outline" size={24} color={palette.text} />
            </Pressable>
          </View>

          {data ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= Math.round(data.averageRating || 0) ? 'star' : 'star-outline'}
                    size={20}
                    color={palette.gold}
                  />
                ))}
              </View>
              <Text style={{ color: palette.text, fontSize: 22, fontWeight: '900' }}>
                {(data.averageRating || 0).toFixed(1)}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '900' }}>
                ({data.totalCount} recensioner)
              </Text>
            </View>
          ) : null}

          {/* Sortering + filter — horizontal scroll-rad så de aldrig klipps */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
            style={{ flexGrow: 0 }}
          >
            {SORT_OPTIONS.map((option) => {
              const active = sort === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setSort(option.value)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: active ? palette.gold : palette.panelMuted,
                    borderWidth: 1, borderColor: active ? palette.gold : palette.border,
                  }}
                >
                  <Text style={{ color: active ? '#000' : palette.text, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>
                    {option.label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: palette.border, marginHorizontal: 4 }} />
            {RATING_FILTERS.map((option) => {
              const active = minRating === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMinRating(option.value)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: active ? palette.gold : palette.panelMuted,
                    borderWidth: 1, borderColor: active ? palette.gold : palette.border,
                  }}
                >
                  <Text style={{ color: active ? '#000' : palette.text, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>
                    {option.label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={palette.gold} />
            </View>
          ) : error ? (
            <Text style={[styles.helperText, { paddingVertical: 24, textAlign: 'center' }]}>{error}</Text>
          ) : !data || data.reviews.length === 0 ? (
            <Text style={[styles.helperText, { paddingVertical: 24, textAlign: 'center' }]}>
              Inga recensioner matchar filtren.
            </Text>
          ) : (
            <FlatList
              data={data.reviews}
              keyExtractor={(r) => r.id}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
              renderItem={({ item }) => (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: '900' }}>
                      {item.customerName}
                    </Text>
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>
                      {formatRelativeDate(item.createdAt)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 2, marginBottom: 6 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Ionicons
                        key={star}
                        name={star <= item.rating ? 'star' : 'star-outline'}
                        size={12}
                        color={palette.gold}
                      />
                    ))}
                  </View>
                  {!!item.comment && (
                    <Text style={[styles.helperText, { lineHeight: 20 }]}>{item.comment}</Text>
                  )}
                  {item.likedItems && item.likedItems.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {item.likedItems.map((name) => (
                        <View
                          key={name}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                            backgroundColor: 'rgba(243,191,87,0.12)',
                          }}
                        >
                          <Text style={{ color: palette.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>
                            ♥ {name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {!!item.reply && (
                    <View
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 12,
                        backgroundColor: 'rgba(217,176,85,0.08)',
                        borderLeftWidth: 2,
                        borderLeftColor: palette.gold,
                      }}
                    >
                      <Text style={{ color: palette.goldDark, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 4 }}>
                        SVAR FRÅN RESTAURANGEN
                      </Text>
                      <Text style={[styles.helperText, { lineHeight: 18 }]}>{item.reply}</Text>
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
