// Sentry — browser-config för admin-panelen. Init:as automatiskt av
// @sentry/nextjs när NEXT_PUBLIC_SENTRY_DSN finns satt. Saknas DSN
// blir init() en no-op och inga events skickas.
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // 10% av page-loads → performance monitoring. Räcker för free-tier.
    tracesSampleRate: 0.1,
    // 100% errors (viktigast)
    sampleRate: 1.0,
    // Session replay — fångar vad user gjorde innan error. Privacy: maska all PII.
    // 10% av sessioner, 100% av sessioner som har errors.
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
