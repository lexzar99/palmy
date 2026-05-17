-- Lägg dricks-belopp på Order. Tidigare skickade frontend tip i payload
-- men backend hade inget fält → tip fell off, total inkluderade inte den,
-- Stripe-belopp (med tip) ≠ order.total → amount-check rejectade ALLA
-- orders med dricks.
ALTER TABLE "Order"
  ADD COLUMN "tipAmount" INTEGER NOT NULL DEFAULT 0;
