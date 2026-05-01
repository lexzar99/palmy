import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
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
import { API_URL } from '../lib/api';
import { useTranslation } from 'react-i18next';

const MAX_ADDRESSES = 3;

interface CityOption {
  id: string;
  name: string;
  deliveryMode: string;
}

interface Props {
  onOpenFull: () => void;
  zoneStatus?: 'ok' | 'error' | null;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
}

export default function AddressPullDown({ onOpenFull, zoneStatus, autoOpen, onAutoOpenHandled }: Props) {
  const { t } = useTranslation();
  const address    = useAppStore((s) => s.address);
  const coords     = useAppStore((s) => s.coords);
  const orderType  = useAppStore((s) => s.orderType);
  const pickupCity = useAppStore((s) => s.pickupCity);
  const setAddress    = useAppStore((s) => s.setAddress);
  const setOrderType  = useAppStore((s) => s.setOrderType);
  const setPickupCity = useAppStore((s) => s.setPickupCity);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen && !open) {
      setOpen(true);
      onAutoOpenHandled?.();
    }
  }, [autoOpen]);

  // Delivery: saved quick addresses
  const [addresses, setAddresses] = useState<QuickAddress[]>([]);

  // Pickup: city list
  const [cities, setCities]           = useState<CityOption[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);

  // Load delivery addresses when dropdown opens
  useEffect(() => {
    if (!open || orderType !== 'DELIVERY') return;
    const load = async () => {
      if (address) {
        await ensureQuickAddress({ street: address, latitude: coords?.lat, longitude: coords?.lng });
      }
      const next = await readQuickAddresses();
      setAddresses(next.slice(0, MAX_ADDRESSES));
    };
    void load();
  }, [open, address, coords?.lat, coords?.lng, orderType]);

  // Load cities when dropdown opens in pickup mode
  useEffect(() => {
    if (!open || orderType !== 'PICKUP') return;
    if (cities.length > 0) return;
    setLoadingCities(true);
    fetch(`${API_URL}/api/cities`)
      .then((r) => r.json())
      .then((data) => {
        const list: CityOption[] = (Array.isArray(data) ? data : [])
          .filter((c: any) => c.isActive && c.deliveryMode !== 'ONLY_DELIVERY')
          .map((c: any) => ({ id: c.id, name: c.name, deliveryMode: c.deliveryMode }));
        setCities(list);
      })
      .catch(() => {})
      .finally(() => setLoadingCities(false));
  }, [open, orderType]);

  const iconFor = (label?: string) => {
    const l = (label || '').toLowerCase();
    if (l.includes('hem')) return 'home';
    if (l.includes('jobb')) return 'briefcase';
    return 'star';
  };

  const displayLabel = orderType === 'PICKUP'
    ? (pickupCity || t('address.city.placeholder'))
    : (address || t('address.street.placeholder'));

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
        <Ionicons
          name={orderType === 'PICKUP' ? 'storefront' : 'location'}
          size={14}
          color={palette.gold}
        />
        <Text numberOfLines={1} style={{ flex: 1, color: displayLabel !== t('address.street.placeholder') && displayLabel !== t('address.city.placeholder') ? palette.text : palette.muted, fontSize: 12, fontWeight: '800' }}>
          {displayLabel}
        </Text>
        {zoneStatus === 'ok' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />}
        {zoneStatus === 'error' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />}
        <Ionicons name="chevron-down" size={14} color={palette.muted} />
        <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: palette.border }} />
      </ScalePressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-start', paddingTop: 100, paddingHorizontal: 16 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: palette.panel, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: palette.border }}
          >
            {orderType === 'DELIVERY' ? (
              // ── Delivery: saved addresses ─────────────────────────────────
              <>
                <Text style={{ color: palette.muted, fontSize: 9, fontWeight: '900', letterSpacing: 3, paddingHorizontal: 10, paddingVertical: 6 }}>
                  {t('address.delivery.label', { count: addresses.length, max: MAX_ADDRESSES })}
                </Text>
                <ScrollView>
                  {addresses.length === 0 && (
                    <Text style={{ color: palette.muted, fontSize: 11, padding: 12 }}>{t('address.delivery.empty')}</Text>
                  )}
                  {addresses.map((a, i) => (
                    <Pressable
                      key={a.id || String(i)}
                      onPress={async () => {
                        const full = formatQuickAddress(a);
                        const addrCoords = a.latitude != null && a.longitude != null
                          ? { lat: a.latitude, lng: a.longitude }
                          : null;
                        await rememberQuickAddress(a);
                        setAddresses(await readQuickAddresses());
                        if (addrCoords && orderType === 'PICKUP') setOrderType('DELIVERY');
                        setAddress(full, addrCoords);
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
                          <Text style={{ color: palette.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1 }}>{t('address.defaultBadge')}</Text>
                        )}
                        {!a.isDefault && (
                          <Pressable hitSlop={8} onPress={async (e) => { e.stopPropagation(); await setDefaultQuickAddress(a); setAddresses(await readQuickAddresses()); }} style={{ padding: 4 }}>
                            <Ionicons name="ellipse-outline" size={14} color={palette.gold} />
                          </Pressable>
                        )}
                        <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); setOpen(false); onOpenFull(); }} style={{ padding: 4 }}>
                          <Ionicons name="create-outline" size={14} color={palette.text} />
                        </Pressable>
                        <Pressable hitSlop={8} onPress={async (e) => { e.stopPropagation(); await removeQuickAddress(a); setAddresses(await readQuickAddresses()); }} style={{ padding: 4 }}>
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
                      {addresses.length >= MAX_ADDRESSES ? t('address.changeAction') : t('address.addAction')}
                    </Text>
                  </Pressable>
                </ScrollView>
              </>
            ) : (
              // ── Pickup: city list ─────────────────────────────────────────
              <>
                <Text style={{ color: palette.muted, fontSize: 9, fontWeight: '900', letterSpacing: 3, paddingHorizontal: 10, paddingVertical: 6 }}>
                  {t('address.pickup.label')}
                </Text>
                <ScrollView>
                  {loadingCities ? (
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={palette.gold} />
                    </View>
                  ) : cities.length === 0 ? (
                    <Text style={{ color: palette.muted, fontSize: 11, padding: 12 }}>{t('address.pickup.empty')}</Text>
                  ) : (
                    cities.map((city, i) => {
                      const active = pickupCity === city.name;
                      return (
                        <Pressable
                          key={city.id}
                          onPress={() => { setPickupCity(city.name); setOpen(false); }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, backgroundColor: active ? 'rgba(234,181,69,0.08)' : 'transparent' }}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: active ? 'rgba(234,181,69,0.15)' : 'rgba(234,181,69,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="storefront-outline" size={14} color={active ? palette.gold : palette.muted} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} style={{ color: active ? palette.gold : palette.text, fontSize: 12, fontWeight: '900' }}>{city.name}</Text>
                            <Text style={{ color: palette.muted, fontSize: 9, fontWeight: '700', marginTop: 1 }}>
                              {city.deliveryMode === 'ALL' ? t('address.mode.both') : t('address.mode.pickupOnly')}
                            </Text>
                          </View>
                          {active && <Ionicons name="checkmark-circle" size={16} color={palette.gold} />}
                        </Pressable>
                      );
                    })
                  )}

                  <Pressable
                    onPress={() => { setOpen(false); onOpenFull(); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(234,181,69,0.3)', marginTop: 4 }}
                  >
                    <Ionicons name="search-outline" size={14} color={palette.gold} />
                    <Text style={{ color: palette.gold, fontSize: 10, fontWeight: '900', letterSpacing: 2 }}>
                      {t('address.searchBtn')}
                    </Text>
                  </Pressable>
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
