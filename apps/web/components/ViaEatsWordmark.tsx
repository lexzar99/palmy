import Link from "next/link";

export default function ViaEatsWordmark({
  href,
  size = "md",
  className = "",
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const fontSize = size === "lg" ? 30 : size === "sm" ? 24 : 28;
  const mark = (
    <span
      className={`inline-flex items-baseline font-black tracking-tight leading-none ${className}`}
      style={{ color: "var(--text-primary)", fontSize }}
      aria-label="ViaEats"
    >
      Via<span style={{ color: "var(--color-gold-500, #F0531C)" }}>Eats</span>
    </span>
  );

  if (!href) return mark;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="ViaEats - startsidan">
      {mark}
    </Link>
  );
}
