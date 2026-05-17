import { useEffect, RefObject } from "react";

/**
 * Focus-trap hook för modaler. När modalen är öppen:
 * - Fångar initial focus på första fokuserbara elementet
 * - Trappar Tab/Shift+Tab så fokus inte lämnar modalen
 * - Återställer fokus till elementet som öppnade modalen vid stängning
 *
 * Krav för WCAG 2.4.3 + ARIA-best-practices för dialog-pattern.
 * Utan detta kan screen reader-användare tabba ut ur modalen och hamna
 * på dolda element under den.
 *
 * Användning:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, isOpen);
 *   return <div ref={ref} role="dialog" aria-modal="true">...</div>;
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const previouslyFocused = (typeof document !== "undefined"
      ? document.activeElement
      : null) as HTMLElement | null;

    const getFocusable = (): HTMLElement[] => {
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null);
    };

    // Initial focus — första fokuserbara elementet (inte close-knappen
    // om vi kan undvika det, eftersom det inte är actionable).
    const focusable = getFocusable();
    const firstReal = focusable.find(
      (el) => !el.getAttribute("aria-label")?.toLowerCase().includes("stäng"),
    );
    (firstReal ?? focusable[0])?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (current === first || !root.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last || !root.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      // Återställ fokus när modalen stänger.
      previouslyFocused?.focus?.();
    };
  }, [active, ref]);
}
