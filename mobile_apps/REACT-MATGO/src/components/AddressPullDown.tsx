import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';
import {
  type QuickAddress,
  ensureQuickAddress,
  formatQuickAddress,
  readQuickAddresses,
  removeQuickAddress,
  rememberQuickAddress,
  setDefaultQuickAddress,
} from '../lib/quickAddresses';
import ScalePressable from './ScalePressable';

const MAX_ADDRESSES = 3;

interface Props {
  onOpenFull: () => void;
  /** "ok" = grön prick, "error" = röd prick, null = ingen prick. */
  zoneStatus?: 'ok' | 'error' | null;
}

/**
 * Kompakt adressväljare i toppen. Drag ner / tryck för att öppna sheet med upp
 * till 3 sparade adresser. Använder `/api/profile/addresses` för inloggade.
 */
export default function AddressPullDown({ onOpenFull, zoneStatus }: Props) {
  const address = useAppStore((s) => s.address);
  const coords = useAppStore((s) => s.coords);
  const orderType = useAppStore((s) => s.orderType);
  const setAddress = useAppStore((s) => s.setAddress);

  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<QuickAddress[]>([]);

  useEffect(() => {
    const load = async () => {
      if (address && orderType === "DELIVERY") {
        await ensureQuickAddress({
          street: address,
          latitude: coords?.lat,
          longitude: coords?.lng,
        });
      }
      const next = await readQuickAddresses();
      setAddresses(next.slice(0, MAX_ADDRESSES));
    };

    void load();
  }, [open, address, coords?.lat, coords?.lng, orderType]);

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
        {zoneStatus === 'ok' && (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
        )}
        {zoneStatus === 'error' && (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
        )}
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
                  onPress={async () => {
                    const full = formatQuickAddress(a);
                    await rememberQuickAddress(a);
                    setAddresses(await readQuickAddresses());
                    setAddress(full, a.latitude != null && a.longitude != null ? { lat: a.latitude, lng: a.longitude } : null);
                    setOpen(false);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12 }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(234,181,69,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={iconFor(a.label) as any} size={14} color={palette.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: palette.text, fontSize: 12, fontWeight: '900' }}>{formatQuickAddress(a)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {a.isDefault && (
                      <Text style={{ color: palette.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1 }}>STANDARD</Text>
                    )}
                    {!a.isDefault && (
                      <Pressable
                        hitSlop={8}
                        onPress={async (event) => {
                          event.stopPropagation();
                          await setDefaultQuickAddress(a);
                          setAddresses(await readQuickAddresses());
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons name="ellipse-outline" size={14} color={palette.gold} />
                      </Pressable>
                    )}
                    <Pressable
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        setOpen(false);
                        onOpenFull();
                      }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="create-outline" size={14} color={palette.text} />
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={async (event) => {
                        event.stopPropagation();
                        await removeQuickAddress(a);
                        setAddresses(await readQuickAddresses());
                      }}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="trash-outline" size={14} color={palette.danger} />
                    </Pressable>
                  </View>
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
