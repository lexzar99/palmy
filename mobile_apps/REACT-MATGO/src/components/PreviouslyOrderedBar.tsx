import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { palette } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';
import ScalePressable from './ScalePressable';

interface Summary {
  hasHistory: boolean;
  orderId?: string;
  orderNumber?: string;
  itemCount?: number;
  total?: number;
  items?: { productId: string; name: string; quantity: number }[];
}

/**
 * Visas överst i restaurangvyn. Tryck = återanvänd senaste ordern via
 * `/api/profile/orders/:id/reorder` och navigera till kassan där rader kan
 * redigeras innan köp.
 */
export default function PreviouslyOrderedBar({
  restaurantId,
  onReorderComplete,
}: {
  restaurantId: string;
  onReorderComplete: () => void;
}) {
  const token = useAppStore((s) => s.token);
  const addItem = useAppStore((s) => s.addItem);
  const clearCart = useAppStore((s) => s.clearCart);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !restaurantId) return;
    api.get(`/api/profile/previously-ordered/${restaurantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => setSummary(r.data))
      .catch(() => setSummary(null));
  }, [token, restaurantId]);

  if (!summary?.hasHistory) return null;

  const handleReorder = async () => {
    if (!summary.orderId || !token) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/profile/orders/${summary.orderId}/reorder`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      clearCart();
      (res.data.items || []).forEach((it: any) => {
        addItem({
          productId: it.productId,
          restaurantId: res.data.restaurantId,
          restaurantSlug: res.data.restaurantSlug,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          extras: it.extras || [],
          note: it.note,
        });
      });
      onReorderComplete();
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  };

  const names = (summary.items || []).slice(0, 2).map((i) => i.name).join(', ');
  const extra = (summary.items || []).length > 2 ? '…' : '';

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        padding: 12,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: palette.panel,
        borderWidth: 1,
        borderColor: 'rgba(234,181,69,0.3)',
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(234,181,69,0.1)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="time-outline" size={16} color={palette.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.gold, fontSize: 9, fontWeight: '900', letterSpacing: 2 }}>DU BESTÄLLDE HÄR SENAST</Text>
        <Text numberOfLines={1} style={{ color: palette.text, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
          {summary.itemCount} rätter · {summary.total} kr{names ? ` · ${names}${extra}` : ''}
        </Text>
      </View>
      <ScalePressable
        onPress={handleReorder}
        style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.gold, flexDirection: 'row', alignItems: 'center', gap: 4 }}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <>
            <Text style={{ color: '#000', fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>BESTÄLL IGEN</Text>
            <Ionicons name="arrow-forward" size={12} color="#000" />
          </>
        )}
      </ScalePressable>
    </View>
  );
}
