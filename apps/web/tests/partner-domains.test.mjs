import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Fas 3: restaurangens domäner ligger i admin. Servern avgör om en domän är
// godkänd, så embed.js och iframen får inte ha egna listor att glömma uppdatera.
test("embed.js skickar alltid sin origin och har ingen domänlista", () => {
  const embed = read("public/embed.js");
  assert.doesNotMatch(embed, /function trustedPartnerOrigin/);
  assert.doesNotMatch(embed, /palmyrapizzeria|fredspizza\.se|ramis-grill|eld-och-vin/);
  assert.match(embed, /var parentOrigin = parentOriginParam\(\);\s*if \(parentOrigin\) frameUrl\.searchParams\.set\("parent_origin", parentOrigin\);/);
  // file:// ger origin "null", och bara https (eller localhost) skickas.
  assert.match(embed, /if \(!origin \|\| origin === "null"\) return null;/);
  assert.match(embed, /if \(protocol === "https:"\) return origin;/);
});

test("kioskbeviset kräver att servern godkänner slug och domän", () => {
  const route = read("app/api/kiosk/session/route.ts");
  assert.match(route, /new URL\("\/api\/embed\/partner", apiBaseUrl\(\)\)/);
  assert.match(route, /url\.searchParams\.set\("origin", origin\)/);
  // Ett nej från servern gäller alltid. Reservlistan används bara när API:t inte svarar.
  assert.match(route, /if \(decision\.kind === "denied"\) \{/);
  assert.match(route, /decision\.kind === "unavailable" && !legacyAllowedRestaurant\(slug\)/);
  assert.match(route, /partner: decision\.kind === "allowed" \? decision\.partner : null/);
});

test("iframen litar bara på partnern som servern bekräftat", () => {
  const partner = read("lib/embedPartner.ts");
  const client = read("lib/kioskAccessClient.ts");
  assert.match(client, /if \(claimedOrigin\) query\.set\("origin", claimedOrigin\);/);
  assert.match(client, /syncEmbedPartnerAfterKiosk\(restaurantSlug, data\.partner, claimedOrigin\);/);
  // En partner från en tidigare embed i fliken får inte ligga kvar.
  assert.match(partner, /partner\.restaurantSlug === restaurantSlug && partner\.origin === claimedOrigin/);
  assert.match(partner, /if \(fromAddress\) return rememberEmbedParentOrigin\(fromAddress\);/);
  // Menysidan kommer från domänraden och måste vara en ren sökväg.
  assert.match(partner, /if \(verified && verified\.origin === origin\) return verified\.menuPath;/);
  assert.match(partner, /\^\\\/\(\?!\\\/\)/);
  assert.doesNotMatch(partner, /TRUSTED_PARTNER_ORIGINS|LEGACY_PARTNER/);
  // Inga restaurangdomäner i webbkoden: de ligger i admin.
  for (const file of ["lib/embedPartner.ts", "components/MenuContent.tsx", "components/restaurant/RestaurantMenu.tsx"]) {
    assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ""), /"https:\/\/(?:www\.)?(?:palmyrapizzeria|fredspizza)\.se"/, file);
  }
  // Förälderns riktiga origin enligt webbläsaren går före adressen.
  assert.match(partner, /window\.location\.ancestorOrigins/);
  assert.match(partner, /if \(event\.source !== window\.parent\) return false;|event\.source !== window\.parent\) return false/);
  // Den uppgivna origin är aldrig betrodd i sig.
  assert.match(partner, /export function claimedEmbedParentOrigin/);
  assert.doesNotMatch(partner.match(/export function claimedEmbedParentOrigin[\s\S]*?\n}\n/)[0], /EMBED_PARENT_ORIGIN_SESSION_KEY\b/);
});

test("betalningsretur till en ny domän väntar in serverns bekräftelse", () => {
  const cart = read("app/cart/page.tsx");
  assert.match(cart, /await ensureKioskAccess\(returnRestaurantSlug, returnParentOriginCandidate\);\s*\}\s*const returnParentOrigin = returnEmbedded/);
  const order = read("app/order/[id]/page.tsx");
  assert.match(order, /\(await verifyEmbedParentOrigin\(restaurantSlug, candidate\)\)/);
});
