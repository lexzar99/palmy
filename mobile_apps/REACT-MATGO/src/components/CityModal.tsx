import React from 'react';
import { View, Text, FlatList, Pressable, Modal } from 'react-native';
import { styles } from '../constants/theme';
import type { City } from '../types';

export default function CityModal({
  open,
  cities,
  selected,
  onClose,
  onSelect,
}: {
  open: boolean;
  cities: City[];
  selected?: string;
  onClose: () => void;
  onSelect: (city: City) => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.sectionHeading}>Choose city</Text>
          <FlatList
            data={cities}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={[styles.cityOption, item.id === selected && styles.extraRowActive]} onPress={() => onSelect(item)}>
                <Text style={styles.summaryLabel}>{item.name}</Text>
                <Text style={styles.summaryValue}>{item.deliveryMode}</Text>
              </Pressable>
            )}
          />
          <Pressable style={{ marginTop: 10 }} onPress={onClose}>
            <Text style={styles.linkText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
