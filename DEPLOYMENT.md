# Deploymentguide - Palmyra Pizzeria

Följ dessa steg för att få upp din sida gratis med HTTPS och automatiska uppdateringar.

## 1. Skapa en gratis PostgreSQL-databas på [Neon.tech](https://neon.tech)
Vercel och Render fungerar inte med SQLite (den raderas vid varje omstart).
1.  Gå till [Neon.tech](https://neon.tech) och registrera ett gratis konto.
2.  Skapa ett nytt projekt: Namn: `palmyra-db`, Region: `Europe (Frankfurt)`.
3.  Välj **Postgres** och kopiera din **Connection String**. Den ser ut så här:
    `postgresql://user:password@host/neondb?sslmode=require`

---

## 2. Ladda upp din kod till GitHub
1.  Skapa ett nytt **privat** repository på [GitHub.com](https://github.com).
2.  Kör dessa kommandon i terminalen (se till att du står i rotmappen för ditt projekt):
    ```bash
    git init
    git add .
    git commit -m "Deployment v1: PostgreSQL and Cloud Support"
    git branch -M main
    git remote add origin https://github.com/DITT_ANVÄNDARNAMN/DITT_REPOO_NAMN.git
    git push -u origin main
    ```

---

## 3. Deploya Backend (API) på [Render.com](https://render.com)
1.  Logga in på Render och skapa en **New Web Service**.
2.  Koppla ditt GitHub-repo.
3.  Inställningar:
    *   **Root Directory**: `packages/api`
    *   **Build Command**: `pnpm install && pnpm build`
    *   **Start Command**: `node dist/index.js`
4.  **Environment Variables**:
    *   `DATABASE_URL`: Klistra in länken från Neon.
    *   `JWT_SECRET`: Något hemligt, t.ex. `super-secret-key`.
    *   `STRIPE_SECRET_KEY`: Din Stripe-nyckel.
    *   `FRONTEND_URL`: URL:en du får från Vercel senare.
    *   `ADMIN_URL`: URL:en du får från Vercel senare.

---

## 4. Deploya Frontend (Web & Admin) på [Vercel.com](https://vercel.com)
Gör detta för **både** `apps/web` och `apps/admin`.
1.  Logga in på Vercel och klicka på **Add New Project**.
2.  Importera ditt GitHub-repo.
3.  För respektive projekt:
    *   **Web**: Root Directory: `apps/web`.
    *   **Admin**: Root Directory: `apps/admin`.
4.  **Environment Variables**:
    *   `NEXT_PUBLIC_API_URL`: URL:en du fick från Render (t.ex. `https://palmyra-api.onrender.com`).
    *   `NEXT_PUBLIC_SOCKET_URL`: Samma som ovan.

---

## Automatiska uppdateringar
Varje gång du gör en ändring i koden lokalt och kör:
```bash
git add .
git commit -m "Mina nya ändringar"
git push
```
Då kommer Vercel och Render automatiskt att bygga om din sida med de senaste ändringarna!
