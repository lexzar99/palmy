import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const {
  isLaunchGateBypassPath,
  prelaunchModeEnabled,
  resolvePrelaunchMode,
} = await import("../lib/prelaunchMode.ts");

test("PRELAUNCH_MODE uses the same explicit 1/0 contract as the API", () => {
  assert.equal(resolvePrelaunchMode("1", "production"), true);
  assert.equal(resolvePrelaunchMode("0", "production"), false);
  assert.equal(prelaunchModeEnabled({ PRELAUNCH_MODE: "1", NODE_ENV: "development" }), true);
  assert.equal(prelaunchModeEnabled({ PRELAUNCH_MODE: "0", NODE_ENV: "development" }), false);
});

test("production fails closed while local development stays usable by default", () => {
  assert.equal(resolvePrelaunchMode(undefined, "production"), true);
  assert.equal(resolvePrelaunchMode("unexpected", "production"), true);
  assert.equal(resolvePrelaunchMode(undefined, "development"), false);
  assert.equal(resolvePrelaunchMode(undefined, "test"), false);
  assert.equal(resolvePrelaunchMode("unexpected", "development"), true);
});

test("PWA and platform association metadata bypass the locked gate", () => {
  assert.equal(isLaunchGateBypassPath("/manifest.webmanifest"), true);
  assert.equal(isLaunchGateBypassPath("/.well-known/apple-app-site-association"), true);
  assert.equal(isLaunchGateBypassPath("/.well-known/assetlinks.json"), true);
  assert.equal(isLaunchGateBypassPath("/.well-known/apple-developer-merchantid-domain-association"), true);
  assert.equal(isLaunchGateBypassPath("/privacy"), true);
  assert.equal(isLaunchGateBypassPath("/terms"), true);
  assert.equal(isLaunchGateBypassPath("/contact"), true);
  assert.equal(isLaunchGateBypassPath("/restaurants/example"), false);
});

test("middleware and homepage both use the shared prelaunch decision", () => {
  const middleware = fs.readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const homepage = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(middleware, /if \(!prelaunchModeEnabled\(\)/);
  assert.match(middleware, /isLaunchGateBypassPath\(pathname\)/);
  assert.match(homepage, /if \(prelaunchModeEnabled\(\)\)/);
});
