import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { placesAutocomplete, placesResolveCoords, type PlaceItem } from "../lib/places";

interface HomeAddressInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (address: string, coords?: { lat: number; lng: number }) => void;
  onPress: () => void;
}

export default function HomeAddressInput({
  value,
  onChangeText,
  onSelect,
  onPress,
}: HomeAddressInputProps) {
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const [suggestions, setSuggestions] = useState<PlaceItem[]>([]);
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
      const items = await placesAutocomplete(text, { bias: "proximity:13.19,55.70" });
      setSuggestions(items);
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

  const handleSelect = async (suggestion: PlaceItem) => {
    const formatted = suggestion.description;
    onChangeText(formatted);
    setSuggestions([]);
    setShowSuggestions(false);
    setIsEditing(false);

    const coords = suggestion.coords ?? (await placesResolveCoords(suggestion));
    onSelect(formatted, coords ?? undefined);
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
          backgroundColor: palette.bg,
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: palette.border,
        }}
      >
        <Ionicons name="location-outline" size={18} color={palette.gold} />
        <Text numberOfLines={1} style={{ flex: 1, color: value ? palette.text : palette.muted, fontSize: 14, fontWeight: "800" }}>
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
          backgroundColor: palette.bg,
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: palette.gold,
        }}
      >
        <Ionicons name="location-outline" size={18} color={palette.gold} />
        <TextInput
          style={{ flex: 1, color: palette.text, fontSize: 14, fontWeight: "800", padding: 0, margin: 0 }}
          value={value}
          onChangeText={handleChange}
          placeholder="Ange din adress..."
          placeholderTextColor={palette.muted}
          autoFocus
          onBlur={() => {
            if (!value) setIsEditing(false);
            setShowSuggestions(false);
          }}
        />
        {loading ? (
          <ActivityIndicator size="small" color={palette.gold} />
        ) : (
          <Pressable onPress={() => setIsEditing(false)}>
            <Ionicons name="checkmark" size={20} color={palette.gold} />
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
              <Ionicons name="location-outline" size={16} color={palette.muted} />
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
    suggestionsContainer: {
      position: "absolute",
      top: 60,
      left: 0,
      right: 0,
      backgroundColor: palette.panel,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
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
      borderBottomColor: "rgba(255,248,234,0.06)",
    },
    suggestionText: {
      flex: 1,
      color: palette.text,
      fontSize: 13,
      fontWeight: "700",
    },
  });
