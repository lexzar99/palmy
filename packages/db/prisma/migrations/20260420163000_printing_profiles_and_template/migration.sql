CREATE TABLE "RestaurantPrinter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "connectionType" TEXT NOT NULL DEFAULT 'NETWORK',
  "address" TEXT NOT NULL,
  "paperWidth" TEXT NOT NULL DEFAULT '80mm',
  "copies" INTEGER NOT NULL DEFAULT 1,
  "autoPrint" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "receiptMode" TEXT NOT NULL DEFAULT 'STANDARD',
  "notes" TEXT,
  "lastSeenAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "RestaurantPrinter_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RestaurantPrinter_restaurantId_isDefault_idx" ON "RestaurantPrinter"("restaurantId", "isDefault");
CREATE INDEX "RestaurantPrinter_restaurantId_isActive_idx" ON "RestaurantPrinter"("restaurantId", "isActive");

CREATE TABLE "ReceiptTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "paperWidth" TEXT NOT NULL DEFAULT '80mm',
  "platformName" TEXT NOT NULL DEFAULT 'ViaEats',
  "elements" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "ReceiptTemplate" ("id", "paperWidth", "platformName", "elements", "createdAt", "updatedAt")
VALUES ('global', '80mm', 'ViaEats', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT("id") DO NOTHING;
