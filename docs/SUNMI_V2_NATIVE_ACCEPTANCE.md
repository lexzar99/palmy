# ViaEats Partner Native — SUNMI V2 / iMin acceptance test

Test artifact: `ViaEats-Partner-Native-Sunmi-V2-26.07.22.apk` in the workspace root (mirrored under `builds/`).

- Package: `com.matgo.restaurant`
- Version: `26.07.22` (`versionCode 70`)
- Minimum Android: 7.0 / API 24
- Production REST + Socket.IO: `https://api.viaeats.se`
- Primary target: SUNMI V2, Android 7.1, 2 GB RAM, 720×1280, built-in 58 mm printer
- Also supported: iMin Android 7–13 with built-in printer

## Install

Install as an update over ViaEats Partner v69 or install on a clean terminal. The APK uses the same signing certificate as the existing Flutter release. If Android reports a signature conflict, uninstall the vendor's unrelated test build first; uninstalling clears pairing and requires a new six-character pairing code.

No battery whitelist or vendor performance mode is required for the first baseline test. Keep the screen at 60 Hz/default resolution and Android animation scale at 1×.

## Functional pass

1. Pair once with a real six-character admin code, kill the app, reopen it, and confirm pairing persists.
2. Confirm restaurant name/open state, pause for 30 minutes, resume, and close/open the restaurant.
3. In Settings, tap **Förhandsvisa ny order-animation** and confirm the alert enters smoothly and closes without changing server state. Then create one pickup, one delivery and one scheduled order from production. Each new order must appear once, open the lightweight alert, loop the ViaEats signal without doubled audio, and stop immediately after accept/reject. Send two orders together and confirm both alerts appear sequentially.
4. Accept with several preparation times. Status must update immediately and exactly one 58 mm receipt must print. Verify item notes, extras, totals and four-line paper feed.
5. Reject an order and confirm that no receipt prints. Advance accepted orders from the dashboard and detail screen.
6. Verify History (including its empty state and refresh button), Menu product toggles, Extras, Deals, Settings, light/dark theme, print settings, logs and sleep screen. Confirm all navigation/order/print icons render as real vector icons without square replacement glyphs, and that the selected preparation time has white text on an orange tile.
7. Disable Wi-Fi for at least 75 seconds while the restaurant is open. Confirm the offline overlay and soft repeating warning; reconnect and confirm automatic recovery.
8. Force-stop after server acceptance but before printing, reopen, and confirm pending-print recovery produces one receipt without later duplicates.

## Performance pass

Warm the app for 30 seconds, reset `gfxinfo`, then scroll Dashboard, History and Menu continuously and open/close 20 orders.

```text
adb shell dumpsys gfxinfo com.matgo.restaurant reset
adb shell dumpsys gfxinfo com.matgo.restaurant
adb shell dumpsys meminfo com.matgo.restaurant
```

Acceptance target on the physical SUNMI V2:

- no frozen frames (>700 ms);
- fewer than 5% janky frames after warm-up;
- no visible hitch during ordinary scrolling or the 140–170 ms fades;
- cached dashboard launch within 2 seconds;
- steady-state total PSS below 120 MB;
- no duplicate order alarm, status request or receipt.

Return a screen recording, the complete `gfxinfo`/`meminfo` output, Android build number and one photographed receipt. Physical-device sign-off is required before calling performance 10/10.

## iMin printer pass

Run the same APK on at least one Android 7 iMin and one Android 13 iMin. In Settings, print the test receipt, then accept a real order. Verify printer connection, ready/paper-out/cover-open reporting, Swedish receipt text, 1–3 copies without duplicates and the 80-dot tear-off feed. These vendor service/JNI and sensor checks require the supplier's physical firmware and cannot be proven by JVM tests alone.
