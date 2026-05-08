import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "#171513" }}
    >
      <div className="text-center space-y-6">
        <p
          className="text-8xl font-black italic uppercase tracking-tighter"
          style={{ color: "#c9a84c" }}
        >
          404
        </p>
        <h1 className="text-3xl font-black italic uppercase tracking-wide text-white">
          Sidan hittades inte
        </h1>
        <p className="text-zinc-400 text-base max-w-xs mx-auto">
          Den här sidan finns inte eller har flyttats.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wide transition-opacity hover:opacity-80"
          style={{ backgroundColor: "#c9a84c", color: "#0a0a0a" }}
        >
          <ArrowLeft size={16} />
          Tillbaka till startsidan
        </Link>
      </div>
    </div>
  );
}
