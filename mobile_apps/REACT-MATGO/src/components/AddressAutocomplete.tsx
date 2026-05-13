import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { placesAutocomplete, placesResolveCoords, type PlaceItem } from "../lib/places";

interface AddressAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (address: string, coords?: { lat: number; lng: number }, parts?: { street?: string; city?: string; zip?: string }) => void;
  placeholder?: string;
}

type Suggestion = PlaceItem;

export default function AddressAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder = "Ange adress...",
}: AddressAutocompleteProps) {
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
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
      const items = await placesAutocomplete(text, { bias: "proximity:13.19,55.70" });
      setSuggestions(items);
    } catch {
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

  const handleSelect = async (suggestion: Suggestion) => {
    const formatted = suggestion.description;
    onChangeText(formatted);
    setSuggestions([]);
    setShowSuggestions(false);
    setLoading(true);
    try {
      const coords = await placesResolveCoords(suggestion);
      onSelect(formatted, coords ?? undefined);
    } finally {
      setLoading(false);
    }
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
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.id}
              style={styles.suggestionItem}
              onPress={() => handleSelect(suggestion)}
            >
              <Ionicons name="location-outline" size={16} color={palette.goldDark} />
              <Text style={styles.suggestionText} numberOfLines={2}>
                {suggestion.description}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (palette: ReturnType<typeof useTheme>["palette"]) =>
  StyleSheet.create({
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
