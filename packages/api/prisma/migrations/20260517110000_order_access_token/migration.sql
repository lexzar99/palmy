-- Add accessToken column to Order for secure guest tracking-URL access.
-- 32-byte slumpad token (genereras i POST /api/orders) ersätter den gamla
-- "5-min grace by age"-loophole som lät attackerare enumerera cuid:er.
ALTER TABLE "Order" ADD COLUMN "accessToken" TEXT;
