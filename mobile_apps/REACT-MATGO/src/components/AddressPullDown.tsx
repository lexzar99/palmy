import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { palette } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';
import ScalePressable from './ScalePressable';

const MAX_ADDRESSES = 3;

export interface QuickAddress {
  id?: string;
  label?: string;
  street: string;
  city?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

interface Props {
  onOpenFull: () => void;
}

/**
 * Kompakt adressväljare i toppen. Drag ner / tryck för att öppna sheet med upp
 * till 3 sparade adresser. Använder `/api/profile/addresses` för inloggade.
 */
export default function AddressPullDown({ onOpenFull }: Props) {
  const address = useAppStore((s) => s.address);
  const setAddress = useAppStore((s) => s.setAddress);
  const token = useAppStore((s) => s.token);

  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<QuickAddress[]>([]);

  useEffect(() => {
    if (!open || !token) return;
    api.get('/api/profile/addresses', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setAddresses((r.data || []).slice(0, MAX_ADDRESSES)))
      .catch(() => setAddresses([]));
  }, [open, token]);

  const iconFor = (label?: string) => {
    const l = (label || '').toLowerCase();
    if (l.includes('hem')) return 'home';
    if (l.includes('jobb')) return 'briefcase';
    return 'star';
  };

  return (
    <>
      <ScalePressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.panel,
        }}
      >
        <Ionicons name="location" size={14} color={palette.gold} />
        <Text numberOfLines={1} style={{ flex: 1, color: address ? palette.text : palette.muted, fontSize: 12, fontWeight: '800' }}>
          {address || 'Välj adress'}
        </Text>
        <Ionicons name="chevron-down" size={14} color={palette.muted} />
        <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: palette.border }} />
      </ScalePressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-start', paddingTop: 100, paddingHorizontal: 16 }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: palette.panel, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: palette.border }}>
            <Text style={{ color: palette.muted, fontSize: 9, fontWeight: '900', letterSpacing: 3, paddingHorizontal: 10, paddingVertical: 6 }}>
              MINA ADRESSER ({addresses.length}/{MAX_ADDRESSES})
            </Text>
            <ScrollView>
              {addresses.length === 0 && (
                <Text style={{ color: palette.muted, fontSize: 11, padding: 12 }}>Inga sparade adresser än.</Text>
              )}
              {addresses.map((a, i) => (
                <Pressable
                  key={a.id || String(i)}
                  onPress={() => {
                    const full = [a.street, a.zip, a.city].filter(Boolean).join(', ');
                    setAddress(full, a.latitude != null && a.longitude != null ? { lat: a.latitude, lng: a.longitude } : null);
                    setOpen(false);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12 }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(234,181,69,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={iconFor(a.label) as any} size={14} color={palette.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.text, fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>{(a.label || 'ADRESS').toUpperCase()}</Text>
                    <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11 }}>{a.street}{a.city ? `, ${a.city}` : ''}</Text>
                  </View>
                  {a.isDefault && (
                    <Text style={{ color: palette.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1 }}>STANDARD</Text>
                  )}
                </Pressable>
              ))}
              <Pressable
                onPress={() => { setOpen(false); onOpenFull(); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(234,181,69,0.3)', marginTop: 4 }}
              >
                <Ionicons name="add" size={14} color={palette.gold} />
                <Text style={{ color: palette.gold, fontSize: 10, fontWeight: '900', letterSpacing: 2 }}>
                  {addresses.length >= MAX_ADDRESSES ? 'ÄNDRA ADRESS' : 'LÄGG TILL / NY ADRESS'}
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
