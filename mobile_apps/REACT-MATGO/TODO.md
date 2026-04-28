# REACT-MATGO — Prioritized TODO

Audit date: 2026-04-28.

---

## AGENT WORKING RULES — READ FIRST, FOLLOW EVERY TIME

1. **Before every step:** Tell the user in plain language what you are about to do and why. Wait for no reply — just state it clearly before touching any file.
2. **Do exactly 2–3 steps per session, then stop.** Do not continue past 3 steps even if the next one looks trivial.
3. **After each step:** Mark it `[x]` in this file immediately.
4. **After every 2–3 steps:** Commit all changes and push to GitHub (`git push origin main`). Tell the user "Pushed — please check GitHub before I continue."
5. **Never batch more than 3 steps before a push.** The user needs to verify nothing broke before you proceed.

---

Work top-down: P0 → P1 → P2 → P3.

For every fix, run on a real device or simulator before marking done — type checks alone will not catch UX regressions.

---

## P0 — Critical (crashes, broken core flows, money loss, security)

- [x] **Fix paid-but-no-order risk in checkout.** `src/screens/CartScreen.tsx:668–725` calls `presentPaymentSheet` BEFORE `POST /api/orders` (line 779). If order creation fails, the customer is charged with no order. Fixed: catch block now attempts `POST /api/payments/refund` automatically; if that also fails, user sees an alert with the `paymentIntentId` reference code to contact support. Long-term: migrate to server-side manual-capture flow.
- [x] **Delete duplicate `useGoogleAuth` in `App.tsx:132–212`.** Deleted — no callers in App.tsx, canonical version in `src/hooks/useGoogleAuth.ts`.
- [x] **Delete dead `PaymentButton` in `App.tsx:215–281`.** Deleted — never rendered, real flow is in `CartScreen.handleCheckoutPress`.
- [x] **Fix `RegisterScreen.tsx:31` initial phone corruption.** Changed `/^\+\d{2}0?/` to `/^\+\d{1,4}0?/` so 1–4 digit country codes (e.g. Finland +358) are all stripped correctly.
- [x] **Fix `RegisterScreen.tsx:53` regex bug.** Changed `/\\D/g` (literal backslash-D, did nothing) to `/\D/g` so non-digits are actually stripped before sending to Supabase.
- [x] **Defer env validation in `src/lib/env.ts`.** `getRequiredExpoPublicEnv` now logs+returns "" instead of throwing at import time. Added `validateEnv()` called in `AppContent` first useEffect — shows an Alert listing missing keys after React mounts.
- [x] **Audit guest-checkout auth.** Backend `orders.ts:199` explicitly handles missing/invalid token as guest — intentional. No change needed.
- [ ] **Persist `favorites` in `HomeScreen.tsx:154`.** Currently `useState<Set<string>>` — wiped on every `CommonActions.reset`. Move into Zustand with AsyncStorage persistence; ideally sync to backend.
- [ ] **Replace `CommonActions.reset` tab switching in `App.tsx:799–804`.** Resetting on every tab tap unmounts screens and kills scroll position / in-progress searches. Migrate to `@react-navigation/bottom-tabs` or use `navigate`.
- [ ] **Don't wipe delivery overrides on transient errors.** `HomeScreen.tsx:218–253` `validateZone` calls `setDeliveryOverrides({})` in `catch` — clears valid fees on a network blip. Only clear on a successful "uncovered" response.
- [ ] **Confirm before clobbering cart.** `useAppStore.addItem` (store ~line 60) silently replaces the cart when `addItem` is called with a different restaurant. Add an Alert ("Töm varukorgen och starta om?") with confirm before replacing.
- [ ] **Add auth header to order polling.** `OrderScreen.tsx:90–92` polls `/api/orders/${id}` every 15 s with no `Authorization` header. If endpoint is auth-gated, polling 401s silently. Add `Bearer ${token}`.
- [ ] **Proxy Geoapify calls through backend.** `AddressAutocomplete.tsx:53`, `CartScreen.tsx:325` and `:595` call Geoapify directly with an `EXPO_PUBLIC_*` key embedded in the bundle. Move to `/api/places/*` like `AddressModal.tsx` already does, or restrict the key in Geoapify dashboard.

## P1 — High (degraded UX, missing essentials, accessibility blockers)

- [ ] **Delete dead duplicate UI components in `App.tsx:284–630`** (`PulseIndicator`, `SpinningLoader`, `Header`, `ScreenWrap`, `RestaurantCard`, `SectionTitle`, `ToggleChip`, `Badge`, `Counter`, `SummaryRow`, `EmptyPanel`, `PrimaryButton`). Canonical versions live in `src/components/ui.tsx`. After deletion, App.tsx drops from ~1186 to ~700 lines.
- [ ] **Remove duplicate push registration in `App.tsx:976–989`.** `usePushNotifications` already registers; the inline block is dead and has stale deps (`token`, `hydrated` missing).
- [ ] **Show stale data + soft refresh after login.** `HomeScreen.tsx` cache key is `token || "__guest__"` so home flashes empty post-login. Render the previous list while fetching.
- [ ] **Add error+retry UI to home.** `HomeScreen.tsx:298–308` swallows fetch failure (`catch { /* silent */ }`) leaving permanent skeleton when there's no cached data. Render an error state with retry CTA.
- [ ] **Fix deal injection at small list sizes.** `HomeScreen.tsx:944` injects deals every 4 restaurants — invisible if `< 4`. Fall back to showing deals above the list.
- [ ] **Remove dead second loading branch in `CartScreen.tsx:823–828`.** Outer guard at line 798 already returned.
- [ ] **Gate promo backdoor behind `__DEV__`.** `CartScreen.tsx:535–545` `handlePromo` accepts `"test"`/`"testa"` and zeros the order total. This is intentional for dev/testing — keep it, but wrap in `if (__DEV__)` so it is compiled out of production builds. **DO THIS FIRST IN P1.**
- [ ] **Fix stale schedule windows in `CartScreen.tsx:213, 225`.** `useMemo` deps include `showTimePicker` which is unrelated. Recompute on a `Date.now()` interval or recompute only when modal opens.
- [ ] **Improve time-picker UX.** `CartScreen.tsx:1057–1124` has no scroll-snap and no current-hour highlight. Use `FlatList` with `initialScrollIndex` set to the current selected hour.
- [ ] **Authenticate WebSocket in `OrderScreen.tsx:73`.** Pass token on socket open; guard `setOrder` calls behind a mounted ref to avoid setState-on-unmounted.
- [ ] **Replace client-side fake-DELIVERED with a real backend call.** `OrderScreen.tsx:100–114` currently flips status to DELIVERED after 12 minutes using only a `setTimeout` — no database write, no source of truth. Replace with a PATCH `/api/orders/${id}/status` call that sets `status = "DELIVERED"` in the database, then update local state from the response. The 12-minute timer can stay as the trigger, but the actual status change must go through the backend so all clients (restaurant tablet, bud, customer) see the same state.
- [ ] **Fix allergen substring match.** `ProductModal.tsx:43–47` `.includes("Mjölk")` matches "Mjölkfri" (false positive). Tokenize on word boundaries.
- [ ] **Make "UTAN X" allergen note opt-in.** `ProductModal.tsx:179–183` auto-appends without asking. Render a checkbox the user must tick.
- [ ] **Pick one "current user" endpoint.** `OnboardingScreen.tsx:200` calls `/api/auth/me`; `ProfileScreen.tsx:166` calls `/api/profile`. Standardize on one and update the backend if needed.
- [ ] **Type the Google `needsPhone` field.** `OnboardingScreen.tsx:78` reads `googleResult.user.needsPhone` — undefined-falsy means Google users skip phone verification. Add a typed contract; fail closed if missing.
- [ ] **Delay `autoFocus` in `AddressModal.tsx:329`** by ~200 ms so keyboard opens after the modal scale animation finishes.
- [ ] **Fix BottomTabs/route mismatch.** `BottomTabs.tsx:17–24` declares 4 tabs; `App.tsx:780` accepts 5 (`"search"` is in the union but not rendered, so the moving pill stays at index 0 when search is active). Either render Search in the tab bar or remove `"search"` from the active prop union.
- [ ] **Fix DiscoverScreen filter clear.** `DiscoverScreen.tsx:38–42` clears `filteredRestaurantIds` on mount even when a deep-link filter is set. Move clear to the cleanup function.
- [ ] **Add error state in `OrderScreen.tsx:62`.** `fetchOrder` catch leaves `loading=true` forever. Set order=null + show error UI.
- [ ] **Validate reorder items.** `ProfileScreen.tsx:545` `handleReorder` doesn't check the restaurant is open or items are in stock. Pre-hit `/api/restaurants/${slug}` and validate before adding to cart.
- [ ] **Mass-add accessibility props.** Every `Pressable` (heart, close, back, counters, country picker, tabs) needs `accessibilityLabel` and `accessibilityRole`. Currently zero across the codebase.
- [ ] **Fix close button overlap in `ProductModal.tsx:208`** with the price chip when there's no product image (zIndex or relocate).
- [ ] **Disable rabattkod input properly in `CartScreen.tsx:1376–1382`.** `editable={false}` after applying still shows cursor and accepts paste on web. Use `pointerEvents="none"` and dim style.
- [ ] **Consolidate auth init in `App.tsx:813–861`.** `checkSession` and `onAuthStateChange` both fetch profile, race-condition `setProfile`. Make `onAuthStateChange` the single source.

## P2 — Medium (polish, perf, minor visual)

- [ ] Wrap autoplay carousel listeners in a ref to avoid leak on rapid index changes (`HomeScreen.tsx:472–498`).
- [ ] Wrap `console.log` image-load logs in `__DEV__` (`RestaurantScreen.tsx:459–461, :578`).
- [ ] Replace fragile sticky-header magic indices with measured layout (`RestaurantScreen.tsx:328`, `:277` magic `+450`).
- [ ] **Fix Expo SDK version mismatch in `package.json`.** SDK is 54 (`expo: ~54.0.33`) but `expo-apple-authentication ^55`, `expo-notifications ^55`, `expo-font ^55`, `expo-linear-gradient ^55` are SDK 55. Run `npx expo install --check` and pin everything to SDK 54. Bump `@react-native-async-storage/async-storage` to 2.x. Remove `playwright` if unused.
- [ ] **Fix `app.json:9` `userInterfaceStyle: "dark"` mismatch.** UI is light cream — set to `"light"` or `"automatic"`.
- [ ] **Plan New Architecture migration.** `app.json:10` `newArchEnabled: false` on RN 0.81 forfeits perf and locks to the legacy bridge.
- [ ] **Add missing iOS plugins/perm strings to `app.json`.** Add `expo-notifications`, `expo-apple-authentication`, `expo-location`, `expo-font` to `plugins`; add `NSLocationWhenInUseUsageDescription` to `ios.infoPlist`. Set `ios.usesAppleSignIn: true` (Apple Sign In is wired in `useAppleAuth.ts`).
- [ ] **Add `development` profile to `eas.json:5`** so EAS dev clients can build.
- [ ] **Reconcile `Order` and `Restaurant` types** with backend response. Audit shows `(order as any).items`, `.total`, `.totalAmount`, `.orderNumber`, `.deliveringAt`, `.rating` all missing from types — see `OrderScreen.tsx:368, 384, 393, 401`. Remove `as any` casts in `App.tsx:763`, `CartScreen.tsx:351`, `OrderScreen.tsx:75` after types are fixed.
- [ ] Rename `isGoogleLinking` → `isOAuthLinking` in `OnboardingScreen.tsx:48, 80, 101` (used for both Google and Apple).
- [ ] Tweak `palette.skeletonHighlight` (#FBF4E8) for more contrast against `panelMuted` (#FFF0D8).
- [ ] Add i18n layer (`i18next`) — country list spans Sweden/Norway/Denmark/Finland but UI is hardcoded Swedish.
- [ ] Center/standardize Header casing (`SearchScreen.tsx:65` uppercase `"SÖK"` vs sentence case elsewhere).
- [ ] Use refs for cache lookups in `HomeScreen.tsx:146` to avoid stale-closure bugs.
- [ ] Reset `AddressModal` on `initialValue`/`initialOrderType` change (`AddressModal.tsx:141` deps too narrow).
- [ ] Log JSON parse errors in `useAppStore.ts:48–57` `hydrate` to a crash reporter instead of silently swallowing.
- [ ] Pre-measure `BottomTabs.tsx:30` layouts so first render's pill isn't at `(0,0)`.
- [ ] Daily-deterministic seed for greetings (`HomeScreen.tsx:215`, `OnboardingScreen.tsx:215`) instead of `Math.random()`.

## P3 — Nice-to-have / refactors

- [ ] Extract Stripe checkout from `CartScreen.handleCheckoutPress` (~250 lines) into `src/lib/checkout.ts`.
- [ ] Split `App.tsx` further: `src/lib/authBootstrap.ts`, `src/navigation/AppNavigator.tsx`.
- [ ] Add top-level `ErrorBoundary` in App.tsx that logs to crash reporter.
- [ ] Wire crash reporting (Sentry) and product analytics (PostHog/Amplitude).
- [ ] Persist `screenCache.ts` to AsyncStorage with TTL for cold-start UX.
- [ ] Move inline JSX styles into `theme.ts` `StyleSheet.create` blocks.
- [ ] Replace `console.log` in `App.tsx:984` ("🚀 Push token registered") with a real logger.
- [ ] Centralize `RestaurantInfoModal`/`CityModal` via context to avoid multiple instances.
- [ ] Pick one language for code/comments (currently mixed Swedish + English).

---

## Working notes

- After each P0/P1 fix, type-check (`npx tsc --noEmit`) and run on iOS simulator.
- **Do NOT** ship anything in P0/P1 without manually testing the affected user flow end-to-end (cart → checkout → order tracking, sign-in via Google/Apple/phone, address change).
- The promo-backdoor item ("test"/"testa" → free order) is the most urgent revenue/security issue — handle before anything else if a release is imminent.
