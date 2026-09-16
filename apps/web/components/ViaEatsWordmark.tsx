import Link from "next/link";

/**
 * viaeats-emblemet ur varumärkespaketet, exporterat till public/brand:
 *  • standard = det breda lockupet: orange smiley + ordmärket "viaeats" i navy
 *    (public/brand/viaeats-lockup.png, transparent bakgrund)
 *  • `mark` = bara den runda smileyn (public/brand/viaeats-smiley-mark.png)
 * `size` styr höjden.
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
  const height = mark
    ? (size === "lg" ? 72 : size === "sm" ? 40 : 56)
    : (size === "lg" ? 44 : size === "sm" ? 26 : 34);
  const src = mark ? "/brand/viaeats-smiley-mark.png" : "/brand/viaeats-lockup.png";
  const ratio = mark ? 621 / 640 : 1200 / 265;
  const emblem = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="viaeats"
      width={Math.round(height * ratio)}
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
