import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Dimensions,
  ScrollView,
  Keyboard,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { placesAutocomplete, placesResolveCoords, type PlaceItem } from "../lib/places";

interface HomeAddressInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (address: string, coords?: { lat: number; lng: number }) => void;
  onPress: () => void;
}

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;

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
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const inputContainerRef = useRef<View>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const measureAnchor = () => {
    inputContainerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

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
    measureAnchor();

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

  const closeOverlay = () => {
    setShowSuggestions(false);
    Keyboard.dismiss();
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

  const dropdownVisible = showSuggestions && suggestions.length > 0 && anchor !== null;
  const dropdownTop = anchor ? anchor.y + anchor.height + 4 : 0;
  const dropdownMaxHeight = anchor
    ? Math.max(120, Math.min(320, SCREEN_HEIGHT - dropdownTop - 80))
    : 240;

  return (
    <View style={styles.container}>
      <View
        ref={inputContainerRef}
        onLayout={measureAnchor}
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
        <Pressable onPress={onPress} hitSlop={6}>
          <Ionicons name="location-outline" size={18} color={palette.gold} />
        </Pressable>
        <TextInput
          style={{ flex: 1, color: palette.text, fontSize: 14, fontWeight: "800", padding: 0, margin: 0 }}
          value={value}
          onChangeText={handleChange}
          placeholder="Ange din adress..."
          placeholderTextColor={palette.muted}
          autoFocus
          onFocus={() => { setShowSuggestions(true); measureAnchor(); }}
          onBlur={() => {
            if (!value) setIsEditing(false);
          }}
        />
        {loading ? (
          <ActivityIndicator size="small" color={palette.gold} />
        ) : (
          <Pressable onPress={() => { setShowSuggestions(false); setIsEditing(false); Keyboard.dismiss(); }}>
            <Ionicons name="checkmark" size={20} color={palette.gold} />
          </Pressable>
        )}
      </View>

      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeOverlay} />
        {anchor && (
          <View
            pointerEvents="box-none"
            style={[
              styles.suggestionsContainer,
              {
                top: dropdownTop,
                left: anchor.x,
                width: anchor.width,
                maxHeight: dropdownMaxHeight,
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator={false}
            >
              {suggestions.map((suggestion, index) => (
                <Pressable
                  key={suggestion.id ?? index}
                  style={styles.suggestionItem}
                  onPress={() => handleSelect(suggestion)}
                >
                  <Ionicons name="location-outline" size={16} color={palette.muted} />
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {suggestion.description}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const makeStyles = (palette: ReturnType<typeof useTheme>["palette"]) =>
  StyleSheet.create({
    container: {
      position: "relative",
    },
    suggestionsContainer: {
      position: "absolute",
      backgroundColor: palette.panel,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 12,
    },
    suggestionItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,248,234,0.06)",
      backgroundColor: palette.panel,
    },
    suggestionText: {
      flex: 1,
      color: palette.text,
      fontSize: 13,
      fontWeight: "700",
    },
  });
