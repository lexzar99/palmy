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

test("launch interest creates an inactive coupon for manual follow-up without automatic email", () => {
  assert.match(api, /router\.post\('\/interest'/);
  assert.match(api, /isActive: false/);
  assert.match(api, /value: 30/);
  assert.match(api, /prisma\.\$transaction/);
  assert.match(api, /manualFollowUp: true/);
  assert.doesNotMatch(api, /sendEmail/);
  assert.doesNotMatch(api, /couponSentAt/);
  assert.match(gate, /följer upp manuellt/);
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
