import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";
import { captureError } from "../lib/sentry";

type Props = {
  children: React.ReactNode;
  onReset?: () => void;
};

type State = {
  error: Error | null;
};

// Functional fallback so we can subscribe to the active theme. The class
// component below is required because React only catches errors via class
// componentDidCatch, but we render the actual UI via this functional child.
function ErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  const { palette } = useTheme();
  const s = React.useMemo(() => makeStyles(palette), [palette]);

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Något gick snett</Text>
        <Text style={s.subtitle}>
          Appen stötte på ett oväntat fel. Vi har fått en signal och tittar på det.
        </Text>
        {__DEV__ && (
          <View style={s.debugBox}>
            <Text style={s.debugTitle}>{error.name}</Text>
            <Text style={s.debugMessage}>{error.message}</Text>
            {!!error.stack && (
              <Text style={s.debugStack}>{error.stack}</Text>
            )}
          </View>
        )}
        <Pressable style={s.button} onPress={onReset}>
          <Text style={s.buttonText}>Försök igen</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError(error, { componentStack: info.componentStack });
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
  }
}

const makeStyles = (palette: ReturnType<typeof useTheme>["palette"]) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      gap: 16,
    },
    title: {
      color: palette.text,
      fontSize: 28,
      fontWeight: "900",
      textAlign: "center",
    },
    subtitle: {
      color: palette.muted,
      fontSize: 15,
      textAlign: "center",
      lineHeight: 22,
    },
    debugBox: {
      backgroundColor: "rgba(220,38,38,0.08)",
      borderColor: "rgba(220,38,38,0.3)",
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      width: "100%",
      gap: 6,
    },
    debugTitle: {
      color: "#fb7185",
      fontSize: 13,
      fontWeight: "800",
    },
    debugMessage: {
      color: palette.text,
      fontSize: 13,
    },
    debugStack: {
      color: palette.muted,
      fontSize: 11,
      fontFamily: "Courier",
    },
    button: {
      marginTop: 8,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: palette.gold,
    },
    buttonText: {
      color: palette.bg,
      fontWeight: "900",
      fontSize: 15,
    },
  });
