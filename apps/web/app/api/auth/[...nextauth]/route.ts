import NextAuth, { DefaultSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import axios from "axios";

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
const API_URL = process.env.API_URL || "https://palmy-production-2021.up.railway.app";

// NextAuth uses NEXTAUTH_URL from environment variables in production.
// If it's missing, we set a smart fallback to prevent redirect_uri_mismatch errors.
if (!process.env.NEXTAUTH_URL) {
  if (process.env.NODE_ENV === "production") {
    process.env.NEXTAUTH_URL = "https://web-production-67f45.up.railway.app";
  } else {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  }
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "PLACEHOLDER",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "PLACEHOLDER",
      authorization: {
        params: {
          prompt: "consent select_account",
        },
      },
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || "PLACEHOLDER",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "PLACEHOLDER",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || "palmy-secret-123",
  debug: process.env.NODE_ENV === "development",
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user?.email) {
        try {
          const res = await axios.post(`${API_URL}/api/account/oauth-token`, {
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
      if (url.includes("/mobile-auth")) return url;
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
      } catch {}
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

export { handler as GET, handler as POST };
