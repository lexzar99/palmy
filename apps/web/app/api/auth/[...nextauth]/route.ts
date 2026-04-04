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

const API_URL = process.env.API_URL || "https://api-production-eb5f.up.railway.app";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || "change-me-in-production",
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
