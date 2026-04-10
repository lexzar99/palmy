import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const GEOAPIFY_KEY = "1ec4188b70ae4a56a1061b9b861f5464";

interface HomeAddressInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (address: string, coords?: { lat: number; lng: number }) => void;
  onPress: () => void;
}

interface Suggestion {
  properties: {
    formatted: string;
  city?: string;
  postcode?: string;
  };
  geometry: {
    coordinates: [number, number];
  };
}

export default function HomeAddressInput({
  value,
  onChangeText,
  onSelect,
  onPress,
}: HomeAddressInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [isEditing, setIsEditing] = useState(false);

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
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:se&bias=proximity:13.19,55.70&limit=5&apiKey=${GEOAPIFY_KEY}`
      );
      const data = await response.json();
      setSuggestions(data.features || []);
    } catch (err) {
      console.error("Autocomplete error:", err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text: string) => {
    onChangeText(text);
    setShowSuggestions(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 300);
  };

  const handleSelect = (suggestion: Suggestion) => {
    const formatted = suggestion.properties.formatted;
    const [lng, lat] = suggestion.geometry.coordinates;
    onChangeText(formatted);
    onSelect(formatted, { lat, lng });
    setSuggestions([]);
    setShowSuggestions(false);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <Pressable
        onPress={() => setIsEditing(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderRadius: 20,
          backgroundColor: "#101015",
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
        }}
      >
        <Ionicons name="location-outline" size={18} color="#e7b24b" />
        <Text numberOfLines={1} style={{ flex: 1, color: value ? "#f9f7f3" : "#6e6a77", fontSize: 14, fontWeight: "800" }}>
          {value || "Ange din adress..."}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderRadius: 20,
          backgroundColor: "#101015",
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: "#e7b24b",
        }}
      >
        <Ionicons name="location-outline" size={18} color="#e7b24b" />
        <TextInput
          style={{ flex: 1, color: "#f9f7f3", fontSize: 14, fontWeight: "800", padding: 0, margin: 0 }}
          value={value}
          onChangeText={handleChange}
          placeholder="Ange din adress..."
          placeholderTextColor="#6e6a77"
          autoFocus
          onBlur={() => {
            if (!value) setIsEditing(false);
            setShowSuggestions(false);
          }}
        />
        {loading ? (
          <ActivityIndicator size="small" color="#e7b24b" />
        ) : (
          <Pressable onPress={() => setIsEditing(false)}>
            <Ionicons name="checkmark" size={20} color="#e7b24b" />
          </Pressable>
        )}
      </Pressable>

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={index}
              style={styles.suggestionItem}
              onPress={() => handleSelect(suggestion)}
            >
              <Ionicons name="location-outline" size={16} color="#b2a8bf" />
              <Text style={styles.suggestionText} numberOfLines={2}>
                {suggestion.properties.formatted}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 100,
  },
  suggestionsContainer: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: "#17151d",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#322b3e",
    overflow: "hidden",
    zIndex: 200,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  suggestionText: {
    flex: 1,
    color: "#f9f7f3",
    fontSize: 13,
    fontWeight: "700",
  },
});