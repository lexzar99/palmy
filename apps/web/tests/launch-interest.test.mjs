import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const gate = fs.readFileSync(new URL("../components/LaunchGate.tsx", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../../../packages/api/src/routes/launch.ts", import.meta.url), "utf8");

test("launch interest asks for explicit identity and stores the return-state cookie", () => {
  assert.match(gate, /interestName/);
  assert.match(gate, /type="email"/);
  assert.match(gate, /marketingConsent/);
  assert.match(gate, /viaeats_launch_interest/);
  assert.match(gate, /Tack för ditt intresse/);
  assert.match(gate, /aria-label="Juridisk information"/);
  assert.match(gate, /href="\/privacy"/);
  assert.match(gate, /href="\/terms"/);
});

test("launch interest mails the shared coupon and never lets a failed send drop the lead", () => {
  assert.match(api, /router\.post\('\/interest'/);
  // Leadet sparas FÖRE utskicket. Kunden ska ligga i listan även när
  // mejltransporten är nere.
  assert.match(api, /launchLead\.create\([\s\S]*?\)\s*;[\s\S]*?sendLaunchWelcomeEmail/);
  // Ingen personlig engångskod skapas längre — alla får den delade koden.
  assert.doesNotMatch(api, /discountCode\.create/);
  assert.match(api, /LAUNCH_SHARED_COUPON_CODE/);
  // couponSentAt sätts bara när transporten bekräftat leverans.
  assert.match(api, /if \(emailed\)/);
  assert.match(api, /couponSentAt: new Date\(\)/);
  // En omregistrering mejlar bara om koden aldrig kom fram.
  assert.match(api, /!existing\.couponSentAt/);
  assert.match(gate, /mejlat din rabattkod/);
});

test("the welcome email carries the coupon, a way back to the site and an unsubscribe path", () => {
  const welcome = fs.readFileSync(
    new URL("../../../packages/api/src/lib/launchWelcomeEmail.ts", import.meta.url),
    "utf8",
  );
  assert.match(welcome, /LAUNCH_SHARED_COUPON_CODE = 'VIAEATS30'/);
  assert.match(welcome, /renderBrandedEmail/);
  // Både HTML och plaintext — ett mejl utan text-del rankas som skräppost.
  assert.match(welcome, /const html = renderBrandedEmail/);
  assert.match(welcome, /const text = \[/);
  assert.match(welcome, /return \{ subject:[^}]*html, text \}/);
  assert.match(welcome, /List-Unsubscribe/);
  assert.match(welcome, /List-Unsubscribe-Post/);
  // Fail-open: utskicket får aldrig kasta upp i registreringen.
  assert.match(welcome, /catch \(error\)[\s\S]*?return false/);
});

test("launch page stores no visitor session, referrer or event telemetry", () => {
  assert.doesNotMatch(gate, /viaeats_launch_session/);
  assert.doesNotMatch(gate, /document\.referrer/);
  assert.doesNotMatch(gate, /trackLaunchEvent/);
  assert.doesNotMatch(gate, /\/api\/launch\/events/);
  assert.doesNotMatch(api, /launchEvent\.(create|findFirst)/);
  assert.match(api, /router\.all\('\/events'/);
  assert.match(api, /status\(410\)/);
});
