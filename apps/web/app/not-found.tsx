import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="text-center space-y-6">
        <p
          className="text-8xl font-black italic uppercase tracking-tighter text-gold-500"
        >
          404
        </p>
        <h1 className="text-3xl font-black italic uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>
          Sidan hittades inte
        </h1>
        <p className="text-base max-w-xs mx-auto" style={{ color: "var(--text-secondary)" }}>
          Den här sidan finns inte eller har flyttats.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wide bg-gold-500 text-zinc-950 transition-opacity hover:opacity-80"
        >
          <ArrowLeft size={16} />
          Tillbaka till startsidan
        </Link>
      </div>
    </div>
  );
}
