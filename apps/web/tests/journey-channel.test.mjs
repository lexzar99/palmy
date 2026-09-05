import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../lib/journey.ts", import.meta.url), "utf8");

/** Plockar ut reglerna ur källan så testet inte kan glida isär från koden. */
function loadRules() {
  const block = src.match(/const CHANNEL_RULES[\s\S]*?\n\];/)[0];
  const rules = [...block.matchAll(/\{ match: \/(.+?)\/, channel: "(.+?)" \}/g)]
    .map(([, pattern, channel]) => ({ match: new RegExp(pattern), channel }));
  assert.ok(rules.length >= 10, "reglerna kunde inte läsas ut");
  return rules;
}

const EGNA = new RegExp(src.match(/const EGNA_DOMANER = \/(.+?)\/;/)[1]);

function channelFor(host) {
  if (EGNA.test(host)) return "Direkt";
  for (const rule of loadRules()) if (rule.match.test(host)) return rule.channel;
  return "Hänvisad";
}

test("kanalerna känns igen från referrerns domän", () => {
  assert.equal(channelFor("www.google.se"), "Google");
  assert.equal(channelFor("www.google.com"), "Google");
  assert.equal(channelFor("l.instagram.com"), "Instagram");
  assert.equal(channelFor("instagram.com"), "Instagram");
  assert.equal(channelFor("m.facebook.com"), "Facebook");
  assert.equal(channelFor("l.facebook.com"), "Facebook");
  assert.equal(channelFor("mail.google.com"), "Gmail");
  assert.equal(channelFor("www.tiktok.com"), "TikTok");
  assert.equal(channelFor("t.co"), "X");
});

test("Gmail vinner över Google — annars försvinner mejltrafiken i söket", () => {
  // mail.google.com matchar båda mönstren; ordningen i listan avgör.
  assert.equal(channelFor("mail.google.com"), "Gmail");
  assert.notEqual(channelFor("mail.google.com"), "Google");
});

test("vår egen domän är intern navigering, inte en trafikkälla", () => {
  assert.equal(channelFor("viaeats.se"), "Direkt");
  assert.equal(channelFor("www.viaeats.se"), "Direkt");
});

test("en okänd domän blir Hänvisad, inte tyst hopslagen med Direkt", () => {
  // En ny källa ska synas i rapporten så den går att upptäcka.
  assert.equal(channelFor("sydsvenskan.se"), "Hänvisad");
  assert.equal(channelFor("lundagard.se"), "Hänvisad");
});

test("annonsklick känns igen även utan referrer", () => {
  // Meta och Google strippar ofta referraren på annonstrafik; klick-id:t
  // överlever och är då enda signalen.
  assert.match(src, /params\.get\("fbclid"\)/);
  assert.match(src, /params\.get\("gclid"\)/);
});

test("kanalen låses vid landningen", () => {
  // Referraren finns bara på första sidvisningen. Utan lagring skulle varje
  // besök skrivas om till Direkt så fort kunden klickade vidare i menyn.
  assert.match(src, /sessionStorage\.getItem\(CHANNEL_KEY\)/);
  assert.match(src, /sessionStorage\.setItem\(CHANNEL_KEY/);
});

test("utm_source vinner över referrern", () => {
  // Mejlutskicket ska tillskrivas mejlet även när länken öppnas i Gmails
  // webbläsare, som skickar mail.google.com som referrer.
  const fn = src.match(/function classifyChannel[\s\S]*?\n}/)[0];
  const utmIndex = fn.indexOf('if (utm) return');
  const referrerIndex = fn.indexOf('for (const rule of CHANNEL_RULES)');
  assert.ok(utmIndex > 0 && referrerIndex > utmIndex, "utm måste testas före referrern");
});

test("ett nytt kampanjklick skriver över äldre sessionskanal", () => {
  assert.match(src, /if \(new URLSearchParams\(window\.location\.search\)\.get\("utm_source"\)\)/);
  assert.match(src, /window\.sessionStorage\.setItem\(CHANNEL_KEY, JSON\.stringify\(value\)\)/);
});
