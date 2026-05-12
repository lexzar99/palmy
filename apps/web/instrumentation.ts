// Next.js 13+ instrumentation hook — registrerar Sentry för server-runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(err: unknown, request: unknown, context: unknown) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request as any, context as any);
}
