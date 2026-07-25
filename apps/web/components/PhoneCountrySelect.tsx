"use client";

// Landskods-väljare för nummerverifiering. Native <select> = PWA-säker, ingen
// overflow, följer temat. Begränsad till våra marknader; Sverige som standard.
const COUNTRIES = [
  { code: "+46", flag: "🇸🇪", name: "Sverige" },
  { code: "+47", flag: "🇳🇴", name: "Norge" },
  { code: "+45", flag: "🇩🇰", name: "Danmark" },
  { code: "+358", flag: "🇫🇮", name: "Finland" },
  { code: "+49", flag: "🇩🇪", name: "Tyskland" },
];

export default function PhoneCountrySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Landskod"
      style={{
        height: 48,
        flex: "0 0 auto",
        width: 104,
        borderRadius: 12,
        border: "1px solid var(--line-strong)",
        background: "var(--bg-secondary)",
        color: "var(--text-primary)",
        padding: "0 8px",
        fontSize: 15,
        fontWeight: 600,
        outline: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.code}
        </option>
      ))}
    </select>
  );
}
