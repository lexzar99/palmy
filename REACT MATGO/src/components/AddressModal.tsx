import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, Modal, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || "";

// Custom helper to generate session tokens
const generateSessionToken = () => {
  return Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
};

interface AddressModalProps {
  visible: boolean;
  initialValue: string;
  onClose: () => void;
  onSelect: (address: string, coords?: { lat: number; lng: number }) => void;
}

interface PlacePrediction {
  description: string;
  place_id: string;
}

export default function AddressModal({
  visible,
  initialValue,
  onClose,
  onSelect,
}: AddressModalProps) {
  const [input, setInput] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const sessionToken = useRef<string>("");

  useEffect(() => {
    if (visible) {
      setInput(initialValue);
      setSuggestions([]);
      sessionToken.current = generateSessionToken();
    }
  }, [visible, initialValue]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchSuggestions = async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&components=country:se&language=sv&sessiontoken=${sessionToken.current}&key=${MAPS_KEY}`
      );
      const data = await response.json();
      setSuggestions(data.predictions || []);
    } catch (err) {
      console.error("Autocomplete error:", err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text: string) => {
    setInput(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 300);
  };

  const handleSelect = async (prediction: PlacePrediction) => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=geometry&sessiontoken=${sessionToken.current}&key=${MAPS_KEY}`
      );
      const data = await response.json();
      const loc = data.result?.geometry?.location;

      if (loc) {
        onSelect(prediction.description, { lat: loc.lat, lng: loc.lng });
      } else {
        onSelect(prediction.description);
      }
      onClose();
    } catch (err) {
      console.error("Geocode error:", err);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>Ange leveransadress</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#f9f7f3" />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#6f667d" />
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={handleChange}
              placeholder="Gatuadress..."
              placeholderTextColor="#6f667d"
              autoFocus
            />
            {loading && <ActivityIndicator size="small" color="#e7b24b" />}
          </View>

          <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.place_id}
                style={({ pressed }) => [styles.resultItem, pressed && styles.resultItemPressed]}
                onPress={() => handleSelect(suggestion)}
              >
                <Ionicons name="location" size={18} color="#e7b24b" />
                <Text style={styles.resultText} numberOfLines={2}>
                  {suggestion.description}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Avbryt</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#0b0a0f",
    borderRadius: 32,
    padding: 24,
    width: "100%",
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#322b3e",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: "#f9f7f3",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#17151d",
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#17151d",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#322b3e",
  },
  input: {
    flex: 1,
    color: "#f9f7f3",
    fontSize: 15,
    fontWeight: "700",
    padding: 0,
    margin: 0,
  },
  results: {
    maxHeight: 350,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: "#17151d",
  },
  resultItemPressed: {
    backgroundColor: "#221d2c",
  },
  resultText: {
    flex: 1,
    color: "#f9f7f3",
    fontSize: 14,
    fontWeight: "700",
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#17151d",
    borderRadius: 16,
  },
  cancelText: {
    color: "#6f667d",
    fontSize: 14,
    fontWeight: "900",
  },
});