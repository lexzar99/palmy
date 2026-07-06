-- Kupongkoder: plattforms-låsning (ALL | APP | WEB).
-- Låter admin skapa app-only-rabattkoder för att driva app-nedladdningar.
-- Additiv, default 'ALL' → alla befintliga koder fortsätter gälla överallt.
-- Servern läser klientens X-Client-Type-header och matchar mot detta fält
-- i POST /api/discount/validate och POST /api/orders (server-sanning).
ALTER TABLE "DiscountCode" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'ALL';
