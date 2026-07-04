import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Betalning klar | Delívera",
  robots: { index: false },
};

// Retursida för Mollie hosted checkout från APPEN. Appen pollar orderstatus
// själv (webhooken är sanningen), så den här sidan behöver bara tala om för
// kunden att stänga webbläsaren. Utan den fick appens Safari-sheet en 404.
export default function PayReturnPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-8 text-center"
      style={{ backgroundColor: "var(--bg-primary, #fff)" }}
    >
      <div
        className="w-14 h-14 rounded-full grid place-items-center mb-5"
        style={{ backgroundColor: "#E8F5EC" }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1E7A3C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary, #111113)" }}>
        Betalningen är registrerad
      </h1>
      <p className="text-[15px] leading-relaxed max-w-xs" style={{ color: "var(--text-secondary, #5C5C61)" }}>
        Gå tillbaka till appen, ordern uppdateras där automatiskt. Du kan stänga det här fönstret.
      </p>
    </div>
  );
}
