import * as Sentry from "@sentry/react-native";
import { EXPO_PUBLIC_SENTRY_DSN } from "./env";

const DSN = EXPO_PUBLIC_SENTRY_DSN;

let initialized = false;

export function initSentry() {
  if (initialized || !DSN) return;
  initialized = true;

  // Wrapped i try/catch — Sentry init kan misslyckas på vissa native-build-
  // tillstånd, och vi vill ALDRIG att init kraschar appen. Hellre tappa
  // error-tracking än locka ut användaren.
  try {
    Sentry.init({
      dsn: DSN,
      environment: __DEV__ ? "development" : "production",
      enableAutoSessionTracking: true,
      tracesSampleRate: __DEV__ ? 1.0 : 0.1,
      // profilesSampleRate kräver Sentry.profilingIntegration() i v7.2 — utan
      // den blir det no-op eller crash. Vi skippar tills profiling-integration
      // är wired up.
      attachStacktrace: true,
      debug: false,
    });
  } catch {
    // Sentry kunde inte initieras — fortsätt utan error-tracking.
    initialized = false;
  }
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function setUser(user: { id?: string; email?: string; phone?: string } | null) {
  if (!initialized) return;
  Sentry.setUser(user);
}

export const wrap = Sentry.wrap;
