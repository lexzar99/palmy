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

interface AddressAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (address: string, coords?: { lat: number; lng: number }, parts?: { street?: string; city?: string; zip?: string }) => void;
  placeholder?: string;
}

type Suggestion = PlaceItem;

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;

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
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
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
    } catch {
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

  const handleFocus = () => {
    setShowSuggestions(true);
    measureAnchor();
  };

  const closeOverlay = () => {
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  const dropdownVisible = showSuggestions && suggestions.length > 0 && anchor !== null;

  // Compute dropdown position — anchor under the input. Cap height so it fits
  // above the keyboard / screen bottom.
  const dropdownTop = anchor ? anchor.y + anchor.height + 4 : 0;
  const dropdownMaxHeight = anchor
    ? Math.max(120, Math.min(320, SCREEN_HEIGHT - dropdownTop - 80))
    : 240;

  return (
    <View style={styles.container}>
      <View ref={inputContainerRef} style={styles.inputContainer} onLayout={measureAnchor}>
        <Ionicons name="location-outline" size={18} color={palette.goldDark} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          onFocus={handleFocus}
        />
        {loading && <ActivityIndicator size="small" color={palette.gold} />}
      </View>

      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeOverlay}>
          {/* Backdrop captures taps to dismiss */}
        </Pressable>
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
      borderBottomColor: palette.border,
      backgroundColor: palette.panel,
    },
    suggestionText: {
      flex: 1,
      color: palette.text,
      fontSize: 13,
      fontWeight: "700",
    },
  });
