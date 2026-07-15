/** Return a single E.164 phone value for the selected country. */
export function toE164Phone(countryCode: string, input: string): string {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (raw.startsWith('00')) return `+${digits.slice(2)}`;
  const country = String(countryCode || '+46').replace(/\D/g, '');
  const national = digits.startsWith(country) ? digits.slice(country.length) : digits.replace(/^0+/, '');
  return `+${country}${national}`;
}
