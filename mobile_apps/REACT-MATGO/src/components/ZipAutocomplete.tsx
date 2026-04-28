import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "../constants/theme";
import { EXPO_PUBLIC_GEOAPIFY_KEY } from "../lib/env";

interface ZipAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (zip: string, city: string, coords?: { lat: number; lng: number }) => void;
}

interface Suggestion {
  properties: {
    postcode?: string;
    city?: string;
    formatted: string;
  };
  geometry: {
    coordinates: [number, number];
  };
}

export default function ZipAutocomplete({
  value,
  onChangeText,
  onSelect,
}: ZipAutocompleteProps) {
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
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:se&limit=5&apiKey=${EXPO_PUBLIC_GEOAPIFY_KEY}`
      );
      const data = await response.json();
      // Filter to only show suggestions with postcode
      const filtered = (data.features || []).filter((f: Suggestion) => f.properties.postcode);
      setSuggestions(filtered);
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
    const zip = suggestion.properties.postcode || "";
    const city = suggestion.properties.city || "";
    const [lng, lat] = suggestion.geometry.coordinates;
    onChangeText(zip);
    onSelect(zip, city, { lat, lng });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <Ionicons name="mail-outline" size={18} color={palette.goldDark} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder="Postnummer"
          placeholderTextColor={palette.muted}
          keyboardType="number-pad"
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
              <Ionicons name="mail-outline" size={16} color={palette.goldDark} />
              <Text style={styles.suggestionText}>
                {suggestion.properties.postcode} {suggestion.properties.city}
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
