import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "../constants/theme";
import { EXPO_PUBLIC_GEOAPIFY_KEY } from "../lib/env";

interface AddressAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (address: string, coords?: { lat: number; lng: number }, parts?: { street?: string; city?: string; zip?: string }) => void;
  placeholder?: string;
}

interface Suggestion {
  properties: {
    formatted: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    postcode?: string;
  };
  geometry: {
    coordinates: [number, number];
  };
}

export default function AddressAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder = "Ange adress...",
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:se&bias=proximity:13.19,55.70&limit=5&apiKey=${EXPO_PUBLIC_GEOAPIFY_KEY}`
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
    const parts = {
      street: suggestion.properties.address_line1,
      city: suggestion.properties.city,
      zip: suggestion.properties.postcode,
    };
    onChangeText(formatted);
    onSelect(formatted, { lat, lng }, parts);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <Ionicons name="location-outline" size={18} color={palette.goldDark} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          onFocus={() => setShowSuggestions(true)}
        />
        {loading && <ActivityIndicator size="small" color={palette.gold} />}
      </View>

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={index}
              style={styles.suggestionItem}
              onPress={() => handleSelect(suggestion)}
            >
              <Ionicons name="location-outline" size={16} color={palette.goldDark} />
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
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
    padding: 0,
    margin: 0,
  },
  suggestionsContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: palette.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: 4,
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
    borderBottomColor: palette.border,
  },
  suggestionText: {
    flex: 1,
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
