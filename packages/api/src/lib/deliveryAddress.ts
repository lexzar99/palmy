/**
 * Leveransadress-validering (kanonisk källa).
 *
 * En kund kunde skriva "224 76" i adressfältet och få igenom ordern: kassans
 * sista-chans-geokodning valde första autocomplete-träffen, postnummerets
 * centroid låg i zonen, och servern krävde bara att `deliveryStreet` inte var
 * tom. Restaurangen fick en beställning utan adress att köra till.
 *
 * Regeln här är därför att en leveransadress måste bära BÅDE ett gatunamn och
 * ett husnummer. Det avvisar postnummer ("224 76"), orter ("Lund"),
 * stadsdelar ("Linero") och hållplatsnamn ("Lund C") utan att vi behöver
 * underhålla en lista över svenska ortnamn — inget av dem har husnummer.
 *
 * Filen är avsiktligt beroendefri så webbklientens spegling kan importera den
 * rakt av i kontrakttestet och bevisa att reglerna inte har glidit isär.
 */

export type DeliveryAddressIssue =
  | 'empty'
  | 'postal-code-only'
  | 'po-box'
  | 'missing-street-name'
  | 'missing-house-number';

/**
 * Medvetet EN form i stället för en diskriminerad union: API-paketet kompilerar
 * med `strict: false`, där en union på `ok` inte smalnar av och varje läsning
 * av `message` blir ett typfel. `message` är tom sträng när adressen duger.
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

/**
 * Husnummer: en fristående siffergrupp, eventuellt med bokstavssuffix
 * ("12", "12A", "12 B"). Den måste stå för sig själv — "Väg9" eller ett
 * femsiffrigt tal är inte ett husnummer.
 */
const HOUSE_NUMBER = /(?:^|[\s,])\d{1,4}\s?[A-Za-zÅÄÖåäö]?(?=$|[\s,])/u;

/**
 * Minst en bokstav = något som kan vara ett gatunamn. Kravet var två i följd,
 * men svenska landsvägsadresser börjar med ett länsbokstavsprefix som kan vara
 * en enda bokstav ("Z 763 224" i Jämtland). Husnummer-kravet nedan är det som
 * gör jobbet; det här filtret finns bara för rena sifferrader.
 */
const STREET_NAME = /\p{L}/u;

const MESSAGES: Record<DeliveryAddressIssue, string> = {
  empty: 'Leveransadress krävs för hemkörning.',
  'postal-code-only':
    'Ett postnummer räcker inte för leverans. Ange gatuadress med husnummer, till exempel Storgatan 12.',
  'po-box':
    'Vi kan inte leverera till en box. Ange en gatuadress med husnummer.',
  'missing-street-name':
    'Ange en leveransadress med både gatunamn och husnummer, till exempel Storgatan 12.',
  'missing-house-number':
    'Adressen saknar husnummer. Välj din gatuadress i listan, till exempel Storgatan 12.',
};

export function normalizeDeliveryStreet(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Avgör om en sträng duger som gatuadress att köra ut till.
 *
 * Postnumret plockas bort först. Annars skulle "224 76 Lund" se ut som en
 * adress med husnummer, vilket är exakt den order vi vill stoppa.
 */
export function checkDeliveryStreet(value: unknown): DeliveryAddressCheck {
  const street = normalizeDeliveryStreet(value);
  const fail = (issue: DeliveryAddressIssue): DeliveryAddressCheck =>
    ({ ok: false, street, issue, message: MESSAGES[issue] });

  if (!street) return fail('empty');

  const withoutPostalCode = street
    .replace(SWEDISH_POSTAL_CODE, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withoutPostalCode) return fail('postal-code-only');

  if (/^(?:box|pb)\b\.?\s*\d+/i.test(withoutPostalCode)) return fail('po-box');
  if (!STREET_NAME.test(withoutPostalCode)) return fail('missing-street-name');
  if (!HOUSE_NUMBER.test(withoutPostalCode)) return fail('missing-house-number');

  return { ok: true, street, issue: null, message: '' };
}

/** Bekvämlighet för klienter som bara vill veta ja/nej. */
export function isDeliverableStreet(value: unknown): boolean {
  return checkDeliveryStreet(value).ok;
}
