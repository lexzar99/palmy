-- Riktiga orders är fortsatt append-only. Det enda DELETE-undantaget är den
-- syntetiska terminaltestorder som backend själv skapar med samtliga nedan
-- markörer. Ett känt order-id räcker alltså aldrig för att passera triggern.
CREATE OR REPLACE FUNCTION viaeats_block_order_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF
    OLD."orderNumber" LIKE 'TEST-%' AND
    OLD."customerName" = 'SERVERTEST' AND
    OLD."stripePaymentIntentId" = 'TEST_PAYMENT' AND
    LOWER(COALESCE(OLD."discountCode", '')) IN ('test', 'testa') AND
    OLD."paymentMethod" = 'TEST'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Hard delete of Order is disabled; use status/tombstone'
    USING ERRCODE = '23503';
END;
$$;
