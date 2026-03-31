ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "RestaurantSettings" ADD COLUMN "notificationSound" TEXT NOT NULL DEFAULT 'signal-1';
