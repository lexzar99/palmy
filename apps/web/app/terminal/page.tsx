import type { Metadata } from "next";
import { TerminalUpdateClient } from "./TerminalUpdateClient";

// Dold sida: nås bara av den som har en engångskod från en parad terminal.
// Ingen länk pekar hit, och den ska aldrig hamna i ett sökresultat.
export const metadata: Metadata = {
  title: "Terminaluppdatering — ViaEats",
  robots: { index: false, follow: false, nocache: true },
};

export default function TerminalUpdatePage() {
  return <TerminalUpdateClient />;
}
