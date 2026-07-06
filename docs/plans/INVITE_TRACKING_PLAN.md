# ViaEats Invite Tracking — Implementation & Migration Plan

> Generated from a grounded codebase analysis (inventory → design → adversarial review).
> Repurposes the existing `Referral` model + deep-link infra into an opaque-token
> share-link system rewarding Dpoints. **Additive only** against the shared Supabase prod DB.
> Status: awaiting owner decisions (§7) before backend/DB/RN execution.

## §0. Verified corrections to the original design idea
| Idea | Reality (verified in code) | Decision |
|---|---|---|
| 12-char token | `CODE_LENGTH=8`, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` | Keep 8-char `generateCode()` |
| status `REWARDED` | enum = `PENDING\|REGISTERED\|ORDERED\|REVERTED` | Use `ORDERED` as terminal |
| AASA missing | AASA route exists, serves valid JSON, already lists `/r/*` | Edit to add `/i/*`; fix domain |
| domain = viaeats.se | entitlement `applinks:viaeats.se` BUT AASA host = `viaeats-web-pi.vercel.app` | **MISMATCH — must reconcile (§5)** |
| dedup by ledger `reason` | no unique index on reason; `recordPointsTx` opens own tx | idempotency via `updateMany WHERE status='REGISTERED'` race-guard |
| `applyPaymentSuccess` atomic | NOT transactional (separate awaits) | rely on status race-guard, not a shared tx |

## §1. Files: DELETE / MODIFY / KEEP
**DELETE (already-dead code):** `apps/web/components/ReferralCard.tsx`, `apps/web/components/ShareInviteCard.tsx`, `apps/web/components/InviteFriendsBanner.tsx` (+ remove dead import `HomeClient.tsx:34`).
**REROUTE (not delete):** `apps/web/app/r/[slug]/page.tsx` — replace `redirect('/')` with real attribution; `/r/<token>` and `/i/<token>` resolve the same `code`. KEEP `apps/web/app/r/[slug]/reviews/page.tsx`.
**Backend MODIFY:** split `routes/referrals.ts` → new `welcome.ts` (welcome-deal exports) + `invite.ts` + `lib/invite.ts`; swap reward call in `lib/stripeReconcile.ts:91`; **remove** duplicate reward calls in `lib/payments/finalize.ts:94` and `routes/payments.ts:537`; repoint welcome imports (`auth.ts`, `orders.ts`, `deals.ts`); update `index.ts` mounts; keep `referralsAdmin` remounted as invite admin.
**KEEP:** `apps/web/lib/deviceFingerprint.ts` (now used by attribute/probe), the platform catch-all proxy, welcome path logic.

## §2. DB — ADDITIVE SQL ONLY (run in Supabase SQL editor, NOT `prisma db push`; diff first)
```sql
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "channel"             TEXT;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "inviteeFingerprint"  TEXT;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "rewardInviterPoints" INTEGER;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "rewardInviteePoints" INTEGER;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "rewardLedgerKey"     TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_rewardLedgerKey_key" ON "Referral"("rewardLedgerKey");
CREATE INDEX IF NOT EXISTS "Referral_inviteeFingerprint_status_idx" ON "Referral"("inviteeFingerprint","status");
CREATE TABLE IF NOT EXISTS "InviteClick" (
  "id" TEXT PRIMARY KEY, "token" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
  "ip" TEXT, "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL );
CREATE INDEX IF NOT EXISTS "InviteClick_fingerprint_expiresAt_idx" ON "InviteClick"("fingerprint","expiresAt");
CREATE INDEX IF NOT EXISTS "InviteClick_token_idx" ON "InviteClick"("token");
```
Mirror identical deltas into BOTH `packages/api/prisma/schema.prisma` and `packages/db/prisma/schema.prisma`. Keep `rewardLedgerKey = NULL` (never `''`). NO drops — legacy `RestaurantSettings.referral*`, `User.referredByCode`, `UserDeal.type=REFERRAL_*` rows stay orphaned-but-safe. Add `InviteClick` TTL sweep cron (GDPR).

## §3. Backend endpoints + reward hook
- `GET /api/account/invite/link` (user) → `{ url: https://<host>/i/<token>, token }` (token = existing `ensureReferralCode`).
- `POST /api/public/invite/click` (none, rate-limited hard) → store `InviteClick` (fp+ip+ua, +7d).
- `POST /api/account/invite/attribute` (user) → bind invitee, idempotent, self-referral + same-device block, fraud flags, status→REGISTERED.
- `POST /api/account/invite/probe` (user, rate-limited) → fuzzy-match recent click → auto-attribute if confident.
- `GET /api/admin/invites*` → reuse existing `referralsAdmin` verbatim.
- `maybeRewardInvite(orderId, userId)` in `applyPaymentSuccess`: first-paid-order (live status set), cap check, **atomic `updateMany WHERE status='REGISTERED'` → ORDERED** race-guard, then grant 200/200 Dpoints via `recordPointsTx(reason=invite_reward:<refId>)` only in won branch.

## §4. Web flow
`/i/[token]` (new) + `/r/[slug]` (rewrite): set first-party cookie `dlv_ref=<token>` (30d, SameSite=Lax) → redirect `/?ref=<token>`; home mirrors to localStorage; `register/page.tsx` posts `/account/invite/attribute {token, deviceFingerprint}` on success (keep redeem path until /attribute deployed); `invite/page.tsx` Share → `GET /account/invite/link`.

## §5. App (RN) — `mobile_apps/ViaEats react app/`
Add `/i/<token>` branch to `App.tsx handleUrl` + cold-start `getInitialURL` (keep `/r/` + `viaeats://r/`); `useAppStore` `pendingInviteToken`; `OnboardingScreen` `attributeInviteIfPending()` + `probe` on first launch + **prominent manual "Har du en inbjudningskod?" 8-char field**; `ShareInviteCard` → `/account/invite/link`.
**BLOCKER:** add `/i/*` to AASA route; **reconcile entitlement domain (`viaeats.se`) ↔ AASA host (`viaeats-web-pi.vercel.app`)** or iOS universal links never fire; add Android `assetlinks.json` + `app.json` intentFilter. Until reconciled + Apple CDN propagates, **manual code is the only app path**.

## §6. Fraud controls (carried over)
Self-referral reject; same-device hard block; 1-paid-order unlock (live status set, not `paid:true`); rate-limit `/attribute` + `/probe` + `/click`; `computeFraudFlags` (FP/IP/disposable-email) blocks reward; cap `referralMaxRewardsPerInviter` (ORDERED/30d); revert claws back 200/200 Dpoints (mirror `revertOrderPointsForRefund`, guard with `revertedAt`); GDPR consent-gate the click fingerprint + 7d TTL.
**Reality:** new-install auto-attribution is best-effort and will miss most iOS installs (no IDFA, CGNAT, web-vs-RN fingerprints differ) — manual code is the de-facto primary mechanism.

## §7. Open decisions (owner)
1. Reward 200/200 Dpoints both sides? (rec: yes, snapshot amounts)
2. Keep "1 paid order" unlock? (rec: yes)
3. Cap 5 rewarded/30d/inviter? (rec: yes)
4. Homegrown + manual code primary vs add Branch/AppsFlyer? (rec: homegrown; revisit SDK only if attribution rate is poor post-launch)

## Execution order
1. Additive SQL (diff first) + both schema.prisma + `prisma generate`.
2. Backend: `welcome.ts` split + repoint imports; `invite.ts` + `maybeRewardInvite`; swap stripeReconcile call; remove duplicate reward calls; remount admin.
3. Web: `/i/[token]` + rewrite `/r/[slug]`; register → `/attribute`; invite page Share → `/invite/link`; delete 3 dead cards + dead import.
4. Infra: AASA `/i/*` + domain reconcile + assetlinks + app.json intentFilter.
5. RN: store field + App.tsx branch + Onboarding attribute/probe/manual field + ShareInviteCard.
6. Cron: InviteClick TTL sweep.
7. Verify: legacy `/r/<code>` + `viaeats://r/` still attribute; double-finalize grants once; refund reverts points.
