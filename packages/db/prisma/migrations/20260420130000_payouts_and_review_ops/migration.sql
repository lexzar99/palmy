ALTER TABLE "User" ADD COLUMN "internalInfo" TEXT;

ALTER TABLE "Order" ADD COLUMN "reviewFlagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "reviewReply" TEXT;
ALTER TABLE "Order" ADD COLUMN "reviewRepliedAt" DATETIME;

CREATE TABLE "RestaurantPayout" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "periodStart" DATETIME NOT NULL,
  "periodEnd" DATETIME NOT NULL,
  "grossSales" INTEGER NOT NULL DEFAULT 0,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "commissionAmount" INTEGER NOT NULL DEFAULT 0,
  "subscriptionAmount" INTEGER NOT NULL DEFAULT 0,
  "adjustmentAmount" INTEGER NOT NULL DEFAULT 0,
  "payoutAmount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "payoutReference" TEXT,
  "approvedAt" DATETIME,
  "approvedBy" TEXT,
  "paidAt" DATETIME,
  "paidBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "RestaurantPayout_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RestaurantPayout_restaurantId_periodStart_periodEnd_key" ON "RestaurantPayout"("restaurantId", "periodStart", "periodEnd");
CREATE INDEX "RestaurantPayout_status_periodStart_periodEnd_idx" ON "RestaurantPayout"("status", "periodStart", "periodEnd");
