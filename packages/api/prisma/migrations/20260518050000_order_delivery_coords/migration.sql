-- Order coords sparas vid order-create för per-zon-ETA-beräkning.
-- Nullable så historiska orders (utan coords) inte bryts; bara nya
-- orders används för zon-statistik.
ALTER TABLE "Order" ADD COLUMN "deliveryLatitude" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "deliveryLongitude" DOUBLE PRECISION;
