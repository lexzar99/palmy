import Link from "next/link";

/**
 * viaeats-emblemet: den riktiga orange smileyn med "via eats" ur
 * varumärkespaketet (Logotyp/exports → public/brand). Ersätter den tidigare
 * textmarkeringen. `size` styr höjden; `mark` visar bara smileyn utan ord.
 */
export default function ViaEatsWordmark({
  href,
  size = "md",
  className = "",
  mark = false,
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  mark?: boolean;
}) {
  const height = size === "lg" ? 72 : size === "sm" ? 44 : 56;
  const src = mark ? "/brand/viaeats-smiley-mark.png" : "/brand/viaeats-smiley.png";
  const emblem = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="viaeats"
      width={Math.round(height * 0.97)}
      height={height}
      className={`inline-block select-none ${className}`}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );

  if (!href) return emblem;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="viaeats – startsidan">
      {emblem}
    </Link>
  );
}
