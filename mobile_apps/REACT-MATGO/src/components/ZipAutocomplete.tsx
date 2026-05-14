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

interface ZipAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (zip: string, city: string, coords?: { lat: number; lng: number }) => void;
}

type Suggestion = PlaceItem & { zip?: string; city?: string };

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;

// Pull "12345 Stockholm" out of a free-text description (handles "123 45" too).
const SE_POSTAL_RE = /\b(\d{3})\s?(\d{2})\b\s+([\p{L}\s\-']+)/u;
function parseZipCity(description: string): { zip?: string; city?: string } {
  const m = description.match(SE_POSTAL_RE);
  if (!m) return {};
  return { zip: `${m[1]}${m[2]}`, city: m[3].trim().split(",")[0].trim() };
}

export default function ZipAutocomplete({
  value,
  onChangeText,
  onSelect,
}: ZipAutocompleteProps) {
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
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const items = await placesAutocomplete(text);
      const enriched: Suggestion[] = items
        .map((item) => ({ ...item, ...parseZipCity(item.description) }))
        .filter((s) => !!s.zip);
      setSuggestions(enriched);
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
    const zip = suggestion.zip || "";
    const city = suggestion.city || "";
    onChangeText(zip);
    setSuggestions([]);
    setShowSuggestions(false);
    setLoading(true);
    try {
      const coords = await placesResolveCoords(suggestion);
      onSelect(zip, city, coords ?? undefined);
    } finally {
      setLoading(false);
    }
  };

  const closeOverlay = () => {
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  const dropdownVisible = showSuggestions && suggestions.length > 0 && anchor !== null;
  const dropdownTop = anchor ? anchor.y + anchor.height + 4 : 0;
  const dropdownMaxHeight = anchor
    ? Math.max(120, Math.min(320, SCREEN_HEIGHT - dropdownTop - 80))
    : 240;

  return (
    <View style={styles.container}>
      <View ref={inputContainerRef} onLayout={measureAnchor} style={styles.inputContainer}>
        <Ionicons name="mail-outline" size={18} color={palette.goldDark} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder="Postnummer"
          placeholderTextColor={palette.muted}
          keyboardType="number-pad"
          onFocus={() => { setShowSuggestions(true); measureAnchor(); }}
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
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.id}
                  style={styles.suggestionItem}
                  onPress={() => handleSelect(suggestion)}
                >
                  <Ionicons name="mail-outline" size={16} color={palette.goldDark} />
                  <Text style={styles.suggestionText}>
                    {suggestion.zip} {suggestion.city}
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
