import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const GEOAPIFY_KEY = "1ec4188b70ae4a56a1061b9b861f5464";

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
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:se&limit=5&apiKey=${GEOAPIFY_KEY}`
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
        <Ionicons name="mail-outline" size={18} color="#b2a8bf" />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder="Postnummer"
          placeholderTextColor="#b2a8bf"
          keyboardType="number-pad"
        />
        {loading && <ActivityIndicator size="small" color="#e7b24b" />}
      </View>

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={index}
              style={styles.suggestionItem}
              onPress={() => handleSelect(suggestion)}
            >
              <Ionicons name="mail-outline" size={16} color="#b2a8bf" />
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
    backgroundColor: "#17151d",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#322b3e",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    color: "#f9f7f3",
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
    backgroundColor: "#17151d",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#322b3e",
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
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  suggestionText: {
    flex: 1,
    color: "#f9f7f3",
    fontSize: 13,
    fontWeight: "700",
  },
});