-- Restaurant.email — public contact email used by the order-tracking
-- "Contact restaurant" button + the restaurant info modal.
ALTER TABLE "Restaurant" ADD COLUMN "email" TEXT;

-- Restaurant.legalName + organizationNumber — surfaced in the restaurant
-- info modal so customers can verify who they're buying from.
ALTER TABLE "Restaurant" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN "organizationNumber" TEXT;
