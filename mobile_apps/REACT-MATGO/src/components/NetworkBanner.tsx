import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NetworkBanner() {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const slideAnim = useRef(new Animated.Value(-250)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable is initially null. We only assume offline if explicitly false
      const connected = state.isConnected === false || state.isInternetReachable === false ? false : true;
      
      // Endast animera om state genuint ändrats för att undvika flickers
      if (connected !== isConnected) {
        setIsConnected(connected);
        Animated.timing(slideAnim, {
          toValue: connected ? -250 : 0,
          duration: 350,
          useNativeDriver: true,
        }).start();
      }
    });

    return () => unsubscribe();
  }, [slideAnim, isConnected]);

  // View element exists continuously but off-screen to allow smooth enter-exit animations
  return (
    <Animated.View 
      pointerEvents="none"
      style={[
        styles.container, 
        { 
          transform: [{ translateY: slideAnim }], 
          paddingTop: Platform.OS === 'ios' ? insets.top + 12 : 44 
        }
      ]}
    >
      <Ionicons name="cloud-offline" size={16} color="#FFF" style={styles.icon} />
      <Text style={styles.text}>Ingen internetanslutning. Söker nätverk...</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#dc2626', // Röd varningsfärg
    zIndex: 999999, // Måste ligga över alla headers occ modaler
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 15,
    shadowColor: '#dc2626',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
