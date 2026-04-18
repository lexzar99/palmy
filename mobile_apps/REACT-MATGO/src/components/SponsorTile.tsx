import React from 'react';
import { View, Text, Alert, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getImageUrl } from '../lib/api';
import { palette } from '../constants/theme';
import ScalePressable from './ScalePressable';

const TILE_WIDTH = 260;
const TILE_HEIGHT = 150;

/**
 * SponsorTile – kompakt annonskort i "Aktuellt"-sektionen.
 * Kortet flippar INTE. Om sponsorn är markerad interaktiv i admin öppnas direkt
 * länken, restaurangen eller dealen vid klick.
 */
export default function SponsorTile({
  sponsor,
  openRestaurant,
  pushRoute,
}: {
  sponsor: any;
  openRestaurant: (slug: string) => void;
  pushRoute?: (route: any) => void;
}) {
  const showName = sponsor.showName !== false;
  const imgUri = getImageUrl(sponsor.imageUrl);

  const target = sponsor.linkTarget || sponsor.ctaLink;
  const isInteractive = sponsor.isClickable && sponsor.linkType !== 'NONE' && !!target;

  const handlePress = () => {
    if (!isInteractive) return;

    const rawTarget = String(target || '');
    const type = sponsor.linkType || (rawTarget.includes('://') ? 'EXTERNAL' : 'RESTAURANT');
    let cleanTarget = rawTarget.startsWith('/') ? rawTarget.slice(1) : rawTarget;
    if (cleanTarget.startsWith('restaurants/')) cleanTarget = cleanTarget.replace('restaurants/', '');

    if (type === 'DEAL') {
      if (!pushRoute) return Alert.alert('Info', 'Det här erbjudandet kan inte öppnas just nu.');
      pushRoute({ name: 'discover-filtered', restaurantIds: [cleanTarget], dealTitle: sponsor.name });
    } else if (type === 'RESTAURANT') {
      openRestaurant(cleanTarget);
    } else if (type === 'EXTERNAL') {
      Linking.openURL(rawTarget).catch(() => Alert.alert('Fel', 'Kunde inte öppna länk.'));
    }
  };

  const Wrapper: any = isInteractive ? ScalePressable : View;
  const wrapperProps: any = isInteractive ? { onPress: handlePress } : {};

  return (
    <Wrapper
      {...wrapperProps}
      style={{
        width: TILE_WIDTH,
        height: TILE_HEIGHT,
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,248,234,0.08)',
        backgroundColor: palette.panel,
      }}
    >
      {!!imgUri && <Image source={{ uri: imgUri }} style={{ width: TILE_WIDTH, height: TILE_HEIGHT }} resizeMode="cover" />}
      {showName && (
        <LinearGradient
          colors={['transparent', 'rgba(23,21,19,0.92)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, padding: 12, justifyContent: 'flex-end' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(234,181,69,0.18)', borderRadius: 4, marginBottom: 4 }}>
                <Text style={{ color: palette.gold, fontSize: 7, fontWeight: '900', letterSpacing: 1 }}>PARTNER</Text>
              </View>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '900', fontStyle: 'italic' }} numberOfLines={1}>
                {(sponsor.name || '').toUpperCase()}
              </Text>
            </View>
            {isInteractive && (
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: palette.gold, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={sponsor.linkType === 'EXTERNAL' ? 'open-outline' : 'arrow-forward'} size={14} color="#000" />
              </View>
            )}
          </View>
        </LinearGradient>
      )}
    </Wrapper>
  );
}
