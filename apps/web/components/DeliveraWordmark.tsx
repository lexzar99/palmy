import Link from "next/link";

export default function DeliveraWordmark({
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
      aria-label="Delívera"
    >
      Del
      <span className="relative inline-block">
        <span style={{ color: "var(--color-gold-500, #F0531C)" }}>í</span>
      </span>
      vera
    </span>
  );

  if (!href) return mark;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Delívera - startsidan">
      {mark}
    </Link>
  );
}
