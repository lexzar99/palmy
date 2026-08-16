/**
 * Spegling av serverns leveransadress-regel.
 *
 * Kanonisk källa: `packages/api/src/lib/deliveryAddress.ts`. Servern är den
 * som avgör — den här kopian finns bara så kunden får beskedet i kassan
 * i stället för efter att ha tryckt på betala. `tests/delivery-address.test.mjs`
 * importerar båda filerna och jämför dem regel för regel, så de inte kan glida
 * isär i tysthet.
 *
 * Varför regeln finns: en kund skrev "224 76" i adressfältet, kassans
 * sista-chans-geokodning tog postnumrets centroid, zonen godkände den och
 * restaurangen fick en order utan adress att köra till.
 */

export type DeliveryAddressIssue =
  | "empty"
  | "postal-code-only"
  | "po-box"
  | "missing-street-name"
  | "missing-house-number";

/**
 * Samma form som serverns (en form, ingen diskriminerad union) — API-paketet
 * kompilerar med `strict: false` där en union på `ok` inte smalnar av.
 * `message` är tom sträng när adressen duger.
 */
export type DeliveryAddressCheck = {
  ok: boolean;
  street: string;
  issue: DeliveryAddressIssue | null;
  message: string;
};

/**
 * Svenskt postnummer: tre siffror, valfritt mellanslag, två siffror — men bara
 * när grupperna inte gränsar till fler siffror. Ett enkelt \b-mönster åt sig in
 * i landsvägsadresser som "AC 768 224" (vägnummer + husnummer) och gjorde dem
 * till "AC 4". Tecknet före fångas och läggs tillbaka, så vi slipper lookbehind
 * som äldre Safari inte kan parsa.
 */
const SWEDISH_POSTAL_CODE = /(^|[^\d])(\d{3}\s?\d{2})(?!\d)/g;
const HOUSE_NUMBER = /(?:^|[\s,])\d{1,4}\s?[A-Za-zÅÄÖåäö]?(?=$|[\s,])/u;
/**
 * Minst en bokstav = något som kan vara ett gatunamn. Kravet var två i följd,
 * men svenska landsvägsadresser börjar med ett länsbokstavsprefix som kan vara
 * en enda bokstav ("Z 763 224" i Jämtland). Husnummer-kravet nedan är det som
 * gör jobbet; det här filtret finns bara för rena sifferrader.
 */
const STREET_NAME = /\p{L}/u;

const MESSAGES: Record<DeliveryAddressIssue, string> = {
  empty: "Leveransadress krävs för hemkörning.",
  "postal-code-only":
    "Ett postnummer räcker inte för leverans. Ange gatuadress med husnummer, till exempel Storgatan 12.",
  "po-box":
    "Vi kan inte leverera till en box. Ange en gatuadress med husnummer.",
  "missing-street-name":
    "Ange en leveransadress med både gatunamn och husnummer, till exempel Storgatan 12.",
  "missing-house-number":
    "Adressen saknar husnummer. Välj din gatuadress i listan, till exempel Storgatan 12.",
};

export function normalizeDeliveryStreet(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function checkDeliveryStreet(value: unknown): DeliveryAddressCheck {
  const street = normalizeDeliveryStreet(value);
  const fail = (issue: DeliveryAddressIssue): DeliveryAddressCheck =>
    ({ ok: false, street, issue, message: MESSAGES[issue] });

  if (!street) return fail("empty");

  const withoutPostalCode = street
    .replace(SWEDISH_POSTAL_CODE, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
  if (!withoutPostalCode) return fail("postal-code-only");

  if (/^(?:box|pb)\b\.?\s*\d+/i.test(withoutPostalCode)) return fail("po-box");
  if (!STREET_NAME.test(withoutPostalCode)) return fail("missing-street-name");
  if (!HOUSE_NUMBER.test(withoutPostalCode)) return fail("missing-house-number");

  return { ok: true, street, issue: null, message: "" };
}

export function isDeliverableStreet(value: unknown): boolean {
  return checkDeliveryStreet(value).ok;
}
