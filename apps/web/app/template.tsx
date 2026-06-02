"use client";

import { motion } from "framer-motion";

/**
 * App-wide page transition. Ett template re-mountas vid varje navigering, så
 * en mjuk fade ger en premium-känsla när man klickar sig runt utan att det
 * känns "cheap". Vi animerar ENDAST opacity (ingen transform) — transform på
 * en förälder skapar en containing block och skulle bryta `position: fixed`
 * (adress-modal, bottom-nav m.m.). Opacity gör inte det.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
