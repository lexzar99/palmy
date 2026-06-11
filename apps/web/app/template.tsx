/**
 * App-wide page transition. Ett template re-mountas vid varje navigering →
 * en mjuk fade när man klickar sig runt.
 *
 * REN CSS-animation (page-fade-in), INTE framer-motion. Framer-varianten
 * skickade SSR-HTML med style="opacity:0" och visade innehållet först när
 * JS hydrerat — på långsamma laddningar (och ibland efter history.back())
 * fastnade sidan osynlig på opacity 0. CSS-faden startar direkt vid paint,
 * kräver ingen JS och kan aldrig lämna sidan dold (utan animation = opacity
 * 1 default). Endast opacity — ingen transform (skulle skapa containing
 * block och bryta position:fixed för modaler/bottom-nav).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade-in">{children}</div>;
}
