ALTER TABLE "Order" ADD COLUMN "appliedDealId" TEXT;
ALTER TABLE "Order" ADD COLUMN "appliedDealTitle" TEXT;

CREATE TABLE "Deal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "badgeText" TEXT,
  "triggerType" TEXT NOT NULL DEFAULT 'NONE',
  "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
  "discountValue" INTEGER NOT NULL,
  "minOrder" INTEGER NOT NULL DEFAULT 0,
  "comboProductIds" TEXT NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "showOnSite" BOOLEAN NOT NULL DEFAULT true,
  "popupEnabled" BOOLEAN NOT NULL DEFAULT true,
  "maxUsages" INTEGER,
  "maxUsesPerCustomer" INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "validFrom" DATETIME,
  "validUntil" DATETIME,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
