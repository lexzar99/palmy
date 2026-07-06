# Local development (localhost, no deploy)

This repo is wired so **web + admin + API all run on localhost**, connected to the
real (shared Supabase) database. Production keeps running unchanged on
Railway (API) + Vercel (web/admin) — those are driven by env vars in the
Railway/Vercel dashboards, **not** by the local files below, so nothing here
affects the live deploy.

## URLs

| Service | URL                     | Port |
|---------|-------------------------|------|
| Web     | http://localhost:3000   | 3000 |
| Admin   | http://localhost:3001   | 3001 |
| API     | http://localhost:4000   | 4000 |

The web/admin Next apps proxy `/api/*` and `/socket.io/*` to the API
(`apps/*/next.config.ts` → `API_PROXY_TARGET || NEXT_PUBLIC_API_URL || http://127.0.0.1:4000`).

## Start everything

```bash
pnpm install            # first time only
bash scripts/sync-local-env.sh   # (re)generate packages/api/.env from Railway prod secrets
pnpm dev                # turbo: starts api + web + admin (+ courier)
```

`pnpm dev` runs all workspaces' `dev` scripts at once. To run one service:
`pnpm --filter @palmyra/api dev`, `pnpm --filter web dev`, `pnpm --filter admin dev`.

## Environment / secrets

`packages/api/.env` is **generated** by `scripts/sync-local-env.sh`, which pulls the
real production secrets from Railway (`laudable-recreation` / `ViaEats API`) and
applies dev-safe overrides:

- `NODE_ENV` left unset → development behaviour (localhost CORS allowed, dev fallbacks on)
- `PORT=4000`
- `DATABASE_URL` / `DIRECT_URL` kept from the previous local env (known-good, URL-encoded)
- Payments forced to **TEST** (Adyen TEST; Stripe key is a dummy — never the live key)
- Real Supabase service-role, R2 (images), Google Maps, Resend (email) are included
- Push secrets (APNs `.p8`, FCM JSON) are skipped — not needed locally

Requires the Railway CLI logged in (`railway whoami`). The generated `.env` and all
`*.bak` files are git-ignored.

### Originals are preserved

The pre-existing local env files were backed up before any change:

- `packages/api/.env.bak`
- `apps/web/.env.local.bak`
- `apps/admin/.env.local.bak`

Restore the minimal original API env with:

```bash
cp packages/api/.env.bak packages/api/.env
```

## Going back to "public" later

There is nothing to undo on the production side — prod env lives in the
Railway/Vercel dashboards. To ship, just deploy as usual (push/redeploy on
those platforms). The localhost wiring above only affects `pnpm dev`.

## ⚠️ Data safety

Local dev talks to the **same Supabase database as production**. Therefore:

- **Never** run `prisma migrate` / `prisma db push` against it unprompted.
- Prefix any test data you create (restaurants/users) so it's identifiable.
- The `admin` super-admin account has **2FA (TOTP) enabled**. Log in with
  username `admin`, the configured password, then your authenticator code
  (same secret as prod). After the first login the device is trusted.

## dpoints

Loyalty system. Admin UI lives under the admin panel; backend routes:
`/api/admin/dpoints/*` (config, overview, sponsor-cards) and customer routes
`/api/dpoints/*` (me, rewards, redeem). See `DPOINTS.md` for the model.
