import NextAuth, { DefaultSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import AppleProvider from "next-auth/providers/apple";
import axios from "axios";

type ProviderCredentials = {
  clientId: string;
  clientSecret: string;
};

declare module "next-auth" {
  interface Session extends DefaultSession {
    platformToken?: string;
    platformUser?: { id: string; name: string; phone?: string; email?: string };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    platformToken?: string;
    platformUser?: { id: string; name: string; phone?: string; email?: string };
  }
}

function getRequiredServerEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

function getApiUrlWithFallback() {
  return (
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "https://palmy-production-2021.up.railway.app"
  );
}

function getNextAuthSecretWithFallback() {
  // NEXTAUTH_SECRET MÅSTE vara satt — om den saknas degrades NextAuth
  // tyst (returnerar tomma sessions från handleAuth catch-block) istället
  // för att krascha hela auth-systemet.
  return process.env.NEXTAUTH_SECRET?.trim() || "";
}

function normalizeOptionalCredential(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "PLACEHOLDER" || trimmed.startsWith("YOUR_")) {
    return null;
  }

  return trimmed;
}

function getProviderCredentials(
  providerName: string,
  clientIdEnvName: string,
  clientSecretEnvName: string
): ProviderCredentials | null {
  const clientId = normalizeOptionalCredential(process.env[clientIdEnvName]);
  const clientSecret = normalizeOptionalCredential(process.env[clientSecretEnvName]);

  // Hoppa graceful över providern om båda saknas eller om bara en är satt.
  // Vi kastar inte längre — det krashar hela NextAuth-handler för alla
  // routes (csrf, session, signin/out) vilket bryter resten av appen.
  if (!clientId || !clientSecret) {
    if (clientId || clientSecret) {
      console.warn(
        `[NextAuth] ${providerName} provider deaktiverad: bara en av ` +
          `${clientIdEnvName} / ${clientSecretEnvName} är satt — sätt båda för att aktivera.`
      );
    }
    return null;
  }

  return { clientId, clientSecret };
}

function isSafeMobileAuthUrl(url: string, baseUrl: string) {
  if (url.startsWith("/mobile-auth")) return true;

  try {
    const parsed = new URL(url);
    return parsed.origin === new URL(baseUrl).origin && parsed.pathname === "/mobile-auth";
  } catch {
    return false;
  }
}

function createAuthHandler() {
  const API_URL = getApiUrlWithFallback();
  const NEXTAUTH_SECRET = getNextAuthSecretWithFallback();
  if (!NEXTAUTH_SECRET) {
    // Utan secret kan vi inte signera JWT-tokens — kasta så handleAuth
    // catchar och returnerar tomma sessions istället.
    throw new Error("NEXTAUTH_SECRET saknas i miljövariabler");
  }
  const googleCredentials = getProviderCredentials("Google", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  const facebookCredentials = getProviderCredentials("Facebook", "FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET");
  // Apple kräver Service ID + JWT-baserad client secret (genererad från Apple privata nyckel).
  // Sätt APPLE_CLIENT_ID = Service ID, APPLE_CLIENT_SECRET = JWT (giltig 6 mån max).
  const appleCredentials = getProviderCredentials("Apple", "APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET");

  return NextAuth({
    providers: [
      ...(googleCredentials
        ? [
            GoogleProvider({
              clientId: googleCredentials.clientId,
              clientSecret: googleCredentials.clientSecret,
              authorization: {
                params: {
                  prompt: "consent select_account",
                },
              },
            }),
          ]
        : []),
      ...(facebookCredentials
        ? [
            FacebookProvider({
              clientId: facebookCredentials.clientId,
              clientSecret: facebookCredentials.clientSecret,
            }),
          ]
        : []),
      ...(appleCredentials
        ? [
            AppleProvider({
              clientId: appleCredentials.clientId,
              clientSecret: appleCredentials.clientSecret,
              authorization: {
                params: {
                  // Apple delar bara namn på första auktorisering – vi vill ha både email + namn.
                  scope: "name email",
                  response_mode: "form_post",
                },
              },
            }),
          ]
        : []),
    ],
    secret: NEXTAUTH_SECRET,
    debug: process.env.NODE_ENV === "development",
    callbacks: {
      async jwt({ token, account, user }) {
        if (account && user?.email) {
          try {
            const res = await axios.post(`${API_URL}/api/auth/oauth-token`, {
              email: user.email,
              name: user.name,
              provider: account.provider,
              providerId: account.providerAccountId,
              image: user.image,
            });
            token.platformToken = res.data.token;
            token.platformUser = res.data.user;
          } catch (err) {
            console.error("OAuth token exchange failed:", err);
          }
        }
        return token;
      },
      async redirect({ url, baseUrl }) {
        if (isSafeMobileAuthUrl(url, baseUrl)) {
          return url.startsWith("/") ? `${baseUrl}${url}` : url;
        }
        // Relative URLs: prepend the base
        if (url.startsWith("/")) return `${baseUrl}${url}`;
        try {
          const parsed = new URL(url);
          // Accept the same origin OR the configured base URL
          if (parsed.origin === baseUrl || parsed.origin === new URL(baseUrl).origin) return url;
          // Also accept our known production domain
          const knownOrigins = [
            "https://web-production-67f45.up.railway.app",
            "http://localhost:3000",
            "http://localhost:3001",
          ];
          if (knownOrigins.includes(parsed.origin)) return url;
        } catch (err) {
          console.warn("Failed to parse callback URL:", err);
        }
        return `${baseUrl}/profile`;
      },
      async session({ session, token }) {
        session.platformToken = token.platformToken;
        session.platformUser = token.platformUser;
        return session;
      },
    },
    pages: {
      signIn: "/profile",
      error: "/profile",
    },
  });
}

async function handleAuth(request: Request, context: RouteContext<"/api/auth/[...nextauth]">) {
  try {
    const handler = createAuthHandler();
    return handler(request, context);
  } catch (error) {
    console.error("NextAuth configuration error:", error);
    // Returnera tom session istället för 500 så att andra delar av appen
    // (Supabase OAuth, OTP-flow) fortsätter fungera även om NextAuth-config
    // är trasig (t.ex. saknad APPLE_CLIENT_SECRET).
    const url = new URL(request.url);
    if (url.pathname.endsWith("/session")) {
      return Response.json({}, { status: 200 });
    }
    if (url.pathname.endsWith("/csrf")) {
      return Response.json({ csrfToken: "" }, { status: 200 });
    }
    if (url.pathname.endsWith("/_log")) {
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: "Auth provider not configured" }, { status: 503 });
  }
}

export const GET = handleAuth;
export const POST = handleAuth;
