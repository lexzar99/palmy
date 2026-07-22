ALTER TABLE "RestaurantPayout"
  ADD COLUMN IF NOT EXISTS "foodVatAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "foodVatPctSnapshot" INTEGER,
  ADD COLUMN IF NOT EXISTS "platformTipAmount" INTEGER;

WITH settings AS (
  SELECT COALESCE("vatCustomerPct", 6) AS "vatCustomerPct"
  FROM "RestaurantSettings"
  WHERE "id" = 'settings'
),
payout_orders AS (
  SELECT
    p."id" AS "payoutId",
    COALESCE(p."selfDeliverySnapshot", r."selfDelivery", false) AS "selfDelivery",
    COALESCE(o."foodVatPercent", r."vatPercent", (SELECT "vatCustomerPct" FROM settings), 6) AS "foodVatPercent",
    GREATEST(o."total", 0) AS "originalTotal",
    LEAST(GREATEST(o."total", 0), GREATEST(COALESCE(o."refundAmount", 0), 0)) AS "refundAmount",
    GREATEST(o."deliveryFee", 0) AS "originalDeliveryFee",
    GREATEST(o."tipAmount", 0) AS "originalTipAmount"
  FROM "RestaurantPayout" p
  JOIN "Restaurant" r ON r."id" = p."restaurantId"
  JOIN "Order" o
    ON o."restaurantId" = p."restaurantId"
   AND o."createdAt" >= p."periodStart"
   AND o."createdAt" <= p."periodEnd"
  WHERE o."status" IN ('DELIVERED', 'COMPLETED')
    AND o."paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED')
    AND (o."discountCode" IS NULL OR o."discountCode" NOT IN ('test', 'testa', 'TEST', 'TESTA'))
    AND (o."stripePaymentIntentId" IS NULL OR o."stripePaymentIntentId" <> 'TEST_PAYMENT')
    AND (o."customerName" IS NULL OR o."customerName" <> 'AUTOTEST')
),
net_orders AS (
  SELECT
    "payoutId",
    "selfDelivery",
    "foodVatPercent",
    ("originalTotal" - "refundAmount") AS "netTotal",
    LEAST(
      ("originalTotal" - "refundAmount"),
      ROUND("originalDeliveryFee" * (("originalTotal" - "refundAmount")::numeric / NULLIF("originalTotal", 0)))::integer
    ) AS "netDeliveryFee",
    "originalTipAmount",
    "originalTotal"
  FROM payout_orders
  WHERE "originalTotal" > 0 AND ("originalTotal" - "refundAmount") > 0
),
net_components AS (
  SELECT
    "payoutId",
    "selfDelivery",
    "foodVatPercent",
    "netTotal",
    "netDeliveryFee",
    LEAST(
      GREATEST("netTotal" - "netDeliveryFee", 0),
      ROUND("originalTipAmount" * ("netTotal"::numeric / NULLIF("originalTotal", 0)))::integer
    ) AS "netTipAmount"
  FROM net_orders
),
aggregated AS (
  SELECT
    "payoutId",
    SUM(
      ROUND(
        GREATEST("netTotal" - "netDeliveryFee" - "netTipAmount", 0)::numeric
        - (
          GREATEST("netTotal" - "netDeliveryFee" - "netTipAmount", 0)::numeric
          / (1 + (COALESCE("foodVatPercent", 0)::numeric / 100))
        )
      )::integer
    ) AS "foodVatAmount",
    CASE WHEN COUNT(DISTINCT "foodVatPercent") = 1 THEN MIN("foodVatPercent") ELSE NULL END AS "foodVatPctSnapshot",
    SUM(CASE WHEN "selfDelivery" THEN 0 ELSE "netTipAmount" END) AS "platformTipAmount"
  FROM net_components
  GROUP BY "payoutId"
)
UPDATE "RestaurantPayout" p
SET
  "foodVatAmount" = CASE
    WHEN p."foodVatAmount" IS NULL OR p."foodVatPctSnapshot" IS NULL THEN aggregated."foodVatAmount"
    ELSE p."foodVatAmount"
  END,
  "foodVatPctSnapshot" = COALESCE(p."foodVatPctSnapshot", aggregated."foodVatPctSnapshot"),
  "platformTipAmount" = COALESCE(p."platformTipAmount", aggregated."platformTipAmount")
FROM aggregated
WHERE p."id" = aggregated."payoutId";
