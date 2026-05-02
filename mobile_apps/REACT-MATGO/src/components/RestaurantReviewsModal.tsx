import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { palette, styles } from '../constants/theme';

type Review = {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  reply: string;
  createdAt: string;
};

type ReviewsResponse = {
  averageRating: number;
  totalCount: number;
  reviews: Review[];
};

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
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !restaurantSlug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get(`/api/restaurants/${restaurantSlug}/reviews`)
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
  }, [visible, restaurantSlug]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { borderRadius: 34, padding: 24, maxHeight: '85%' }]}>
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

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={palette.gold} />
            </View>
          ) : error ? (
            <Text style={[styles.helperText, { paddingVertical: 24, textAlign: 'center' }]}>{error}</Text>
          ) : !data || data.reviews.length === 0 ? (
            <Text style={[styles.helperText, { paddingVertical: 24, textAlign: 'center' }]}>
              Inga recensioner än. Bli den första att lämna en!
            </Text>
          ) : (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 16,
                  paddingBottom: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: palette.border,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= Math.round(data.averageRating) ? 'star' : 'star-outline'}
                      size={20}
                      color={palette.gold}
                    />
                  ))}
                </View>
                <Text style={{ color: palette.text, fontSize: 22, fontWeight: '900' }}>
                  {data.averageRating.toFixed(1)}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '900' }}>
                  ({data.totalCount} recensioner)
                </Text>
              </View>

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
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
