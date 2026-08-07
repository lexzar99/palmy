import prisma from './prisma';

export type LaunchDatabaseSchemaCheck = {
  key: string;
  ok: boolean;
};

export type LaunchDatabaseSchemaIssue = {
  key: string;
  message: string;
};

const REQUIRED_CHECKS: Readonly<Record<string, string>> = {
  restaurant_archived_at: 'Restaurant.archivedAt saknas',
  customer_soft_delete: 'User.deletedAt saknas; kontoradering kan inte tombstone-säkras',
  customer_legacy_credentials_absent: 'Legacy-fält för kundlösenord eller e-postverifiering finns kvar',
  order_client_request_id: 'Order.clientRequestId saknas',
  order_client_request_unique: 'Unikt index för Order.clientRequestId saknas',
  extra_group_restaurant_index: 'Tenant-index för ExtraGroup.restaurantId saknas',
  restaurant_archived_index: 'Index för Restaurant.archivedAt saknas',
  category_restaurant_restrict: 'Category.restaurantId saknar ON DELETE RESTRICT',
  extra_group_restaurant_restrict: 'ExtraGroup.restaurantId saknar ON DELETE RESTRICT',
  deal_restaurant_restrict: 'Deal.restaurantId saknar ON DELETE RESTRICT',
  order_restaurant_restrict: 'Order.restaurantId saknar ON DELETE RESTRICT',
  product_vat_percent: 'Product.vatPercent saknas',
  order_tax_discount_snapshot: 'Orderns moms-/rabatt-/avgiftssnapshot är ofullständig',
  order_discount_funding_snapshot: 'Orderns frysta finansieringskälla för rabatter saknas',
  order_discount_funding_history_complete: 'Historiska rabattkällor eller deras frysta ViaEats-finansiering är ofullständiga',
  order_mollie_payment_id_unique: 'Flera bokföringsorder delar samma Mollie-betalningsreferens',
  order_item_vat_percent: 'OrderItem.vatPercent saknas',
  payment_effects_completed_at: 'Order.paymentEffectsCompletedAt saknas',
  payment_provider_without_default: 'Order.paymentProvider har fortfarande ett databasdefault',
  product_vat_check: 'Databaskontroll för Product.vatPercent saknas',
  order_discount_nonnegative_check: 'Databaskontroll för icke-negativa orderkomponenter saknas',
  order_discount_funding_check: 'Databaskontroll för plattformsfinansierade rabatter saknas',
  order_food_vat_check: 'Databaskontroll för matmoms saknas',
  order_delivery_vat_check: 'Databaskontroll för leveransmoms saknas',
  order_item_vat_check: 'Databaskontroll för orderradsmoms saknas',
  launch_lead_table: 'LaunchLead-tabellen saknas',
  launch_lead_columns: 'LaunchLead saknar obligatoriska launchfält',
  launch_lead_email_unique: 'Unikt index för LaunchLead.email saknas',
  launch_lead_coupon_unique: 'Unikt index för LaunchLead.couponCode saknas',
  restaurant_payout_restrict: 'RestaurantPayout.restaurantId saknar ON DELETE RESTRICT',
  customer_push_tables: 'Tabeller för enheter, orderprenumerationer, outbox eller leveransmätning saknas',
  device_installation_security: 'DeviceInstallation saknar krypterad token/hash/aktiv status',
  device_installation_unique: 'Unik provider/installation-identitet saknas',
  notification_outbox_lease: 'NotificationOutbox saknar dedupe eller lease/retry-fält',
  notification_outbox_dedupe: 'Unikt outbox-dedupeindex saknas',
  order_hard_delete_guard: 'Databastrigger som blockerar hard-delete av Order saknas',
  refund_ledger_columns: 'PaymentRefund-ledgern saknas eller är ofullständig',
  refund_ledger_indexes: 'PaymentRefund-ledgern saknar dedupe- eller revisionsindex',
  refund_ledger_restrict: 'PaymentRefund.orderId saknar ON DELETE RESTRICT',
  refund_ledger_checks: 'PaymentRefund-ledgern saknar belopps-, provider-, status-, source- eller referenskontroll',
  refund_ledger_guards: 'PaymentRefund-ledgern saknar immutabilitets- eller hard-delete-trigger',
  refund_ledger_history_complete: 'Orderns betalstatus/refundbelopp och PSP-verifierad refund-ledger avviker åt något håll',
  payout_hard_delete_guard: 'Databastrigger som blockerar hard-delete av RestaurantPayout saknas',
  payout_recovery_columns: 'RestaurantPayout saknar separata manuella/automatiska justeringar eller ekonomisnapshot',
  payout_recovery_table: 'PayoutRecoveryAllocation-ledgern saknas eller är ofullständig',
  payout_recovery_indexes: 'Payout recovery-ledgern saknar unika/indexerade käll- och målpayouts',
  payout_recovery_restrict: 'Payout recovery-ledgerns käll-/mål-FK saknar ON DELETE RESTRICT',
  payout_recovery_guards: 'Payout recovery-ledgern saknar validerings- eller hard-delete-trigger',
  paid_payout_snapshots_complete: 'Minst en PAID payout saknar ekonomisnapshot; nästa payout måste blockeras tills audit/backfill',
  launch_event_absent: 'Obsolet pseudonym LaunchEvent-mätning finns fortfarande kvar',
  guest_notification_nullable: 'Gästorder kan inte lagra orderspecifik push utan User-rad',
};

export function launchDatabaseSchemaIssues(
  checks: readonly LaunchDatabaseSchemaCheck[],
): LaunchDatabaseSchemaIssue[] {
  const byKey = new Map(checks.map((check) => [check.key, check.ok]));
  return Object.entries(REQUIRED_CHECKS)
    .filter(([key]) => byKey.get(key) !== true)
    .map(([key, message]) => ({ key: `database_schema_${key}`, message }));
}

/**
 * Verifies the reviewed launch patches without trusting Prisma's broken
 * production migration history. This is read-only and safe for `/ready`.
 */
export async function getLaunchDatabaseSchemaIssues(): Promise<LaunchDatabaseSchemaIssue[]> {
  const checks = await prisma.$queryRaw<LaunchDatabaseSchemaCheck[]>`
    SELECT * FROM (VALUES
      ('restaurant_archived_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Restaurant' AND column_name = 'archivedAt'
      )),
      ('customer_soft_delete', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'deletedAt'
      )),
      ('customer_legacy_credentials_absent', NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'User'
          AND column_name IN (
            'password',
            'passwordResetToken',
            'passwordResetExpiresAt',
            'emailVerificationToken',
            'emailVerificationExpiresAt',
            'emailVerifiedAt'
          )
      )),
      ('order_client_request_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Order' AND column_name = 'clientRequestId'
      )),
      ('order_client_request_unique', EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'Order_clientRequestId_key'
      )),
      ('extra_group_restaurant_index', EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'ExtraGroup_restaurantId_idx'
      )),
      ('restaurant_archived_index', EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'Restaurant_archivedAt_idx'
      )),
      ('category_restaurant_restrict', EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'Category'
          AND c.conname = 'Category_restaurantId_fkey' AND c.contype = 'f' AND c.confdeltype = 'r'
      )),
      ('extra_group_restaurant_restrict', EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'ExtraGroup'
          AND c.conname = 'ExtraGroup_restaurantId_fkey' AND c.contype = 'f' AND c.confdeltype = 'r'
      )),
      ('deal_restaurant_restrict', EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'Deal'
          AND c.conname = 'Deal_restaurantId_fkey' AND c.contype = 'f' AND c.confdeltype = 'r'
      )),
      ('order_restaurant_restrict', EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'Order'
          AND c.conname = 'Order_restaurantId_fkey' AND c.contype = 'f' AND c.confdeltype = 'r'
      )),
      ('product_vat_percent', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Product' AND column_name = 'vatPercent'
      )),
      ('order_tax_discount_snapshot', (
        SELECT COUNT(*) = 5 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Order'
          AND column_name IN ('foodDiscountAmount', 'deliveryDiscountAmount', 'smallOrderFee', 'foodVatPercent', 'deliveryVatPercent')
      )),
      ('order_discount_funding_snapshot', (
        SELECT COUNT(*) = 2 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Order'
          AND column_name IN ('platformFundedFoodDiscountAmount', 'platformFundedDeliveryDiscountAmount')
      )),
      ('order_discount_funding_history_complete', NOT EXISTS (
        SELECT 1
        FROM "Order" o
        LEFT JOIN "UserDeal" ud ON ud."id" = o."userDealId"
        LEFT JOIN "Deal" d ON d."id" = o."appliedDealId"
        WHERE COALESCE(o."accountingExcluded", FALSE) = FALSE
          AND UPPER(o."paymentStatus") IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND LOWER(COALESCE(o."discountCode", '')) NOT IN ('test', 'testa')
          AND COALESCE(o."stripePaymentIntentId", '') <> 'TEST_PAYMENT'
          AND o."customerName" <> 'AUTOTEST'
          AND (
          COALESCE(o."discountAmount", 0) > 0
          OR COALESCE(o."foodDiscountAmount", 0) > 0
          OR COALESCE(o."deliveryDiscountAmount", 0) > 0
        ) AND (
          (o."userDealId" IS NOT NULL AND ud."id" IS NULL)
          OR (
            o."userDealId" IS NULL
            AND o."appliedDealId" IS NOT NULL
            AND d."id" IS NULL
          )
          OR (
            (
              (ud."id" IS NOT NULL AND ud."type" IN (
                'WELCOME', 'REFERRAL_INVITER', 'REFERRAL_INVITEE', 'MANUAL'
              ))
              OR (
                o."userDealId" IS NULL
                AND d."id" IS NOT NULL
                AND d."isPersonalTemplate" = TRUE
              )
            ) AND (
              o."platformFundedFoodDiscountAmount" <> o."foodDiscountAmount"
              OR o."platformFundedDeliveryDiscountAmount" <> o."deliveryDiscountAmount"
            )
          )
          OR (
            o."userDealId" IS NULL
            AND o."appliedDealId" IS NULL
            AND o."discountCode" IS NULL
          )
          OR (
            (
              (ud."id" IS NOT NULL AND ud."type" NOT IN (
                'WELCOME', 'REFERRAL_INVITER', 'REFERRAL_INVITEE', 'MANUAL'
              ))
              OR (
                o."userDealId" IS NULL
                AND d."id" IS NOT NULL
                AND d."isPersonalTemplate" = FALSE
              )
              OR (
                o."userDealId" IS NULL
                AND o."appliedDealId" IS NULL
                AND o."discountCode" IS NOT NULL
              )
            ) AND (
              o."platformFundedFoodDiscountAmount" > 0
              OR o."platformFundedDeliveryDiscountAmount" > 0
            )
          )
        )
      )),
      ('order_mollie_payment_id_unique', NOT EXISTS (
        SELECT 1
        FROM "Order" o
        WHERE COALESCE(o."accountingExcluded", FALSE) = FALSE
          AND UPPER(o."paymentStatus") IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND o."molliePaymentId" IS NOT NULL
          AND BTRIM(o."molliePaymentId") <> ''
          AND LOWER(COALESCE(o."discountCode", '')) NOT IN ('test', 'testa')
          AND COALESCE(o."stripePaymentIntentId", '') <> 'TEST_PAYMENT'
          AND o."customerName" <> 'AUTOTEST'
        GROUP BY BTRIM(o."molliePaymentId")
        HAVING COUNT(*) > 1
      )),
      ('order_item_vat_percent', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'OrderItem' AND column_name = 'vatPercent'
      )),
      ('payment_effects_completed_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Order' AND column_name = 'paymentEffectsCompletedAt'
      )),
      ('payment_provider_without_default', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Order'
          AND column_name = 'paymentProvider' AND column_default IS NULL
      )),
      ('product_vat_check', EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = current_schema() AND c.conname = 'Product_vatPercent_check' AND c.contype = 'c'
      )),
      ('order_discount_nonnegative_check', EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = current_schema() AND c.conname = 'Order_discount_components_nonnegative_check' AND c.contype = 'c'
      )),
      ('order_discount_funding_check', EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = current_schema()
          AND c.conname = 'Order_platform_funded_discount_components_check'
          AND c.contype = 'c' AND c.convalidated
      )),
      ('order_food_vat_check', EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = current_schema() AND c.conname = 'Order_foodVatPercent_check' AND c.contype = 'c'
      )),
      ('order_delivery_vat_check', EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = current_schema() AND c.conname = 'Order_deliveryVatPercent_check' AND c.contype = 'c'
      )),
      ('order_item_vat_check', EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = current_schema() AND c.conname = 'OrderItem_vatPercent_check' AND c.contype = 'c'
      )),
      ('launch_lead_table', EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'LaunchLead'
      )),
      ('launch_lead_columns', (
        SELECT COUNT(*) = 3 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'LaunchLead'
          AND column_name IN ('email', 'couponCode', 'marketingConsentAt')
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'LaunchLead'
          AND column_name IN ('sessionId', 'referrer')
      )),
      ('launch_lead_email_unique', EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'LaunchLead_email_key'
      )),
      ('launch_lead_coupon_unique', EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'LaunchLead_couponCode_key'
      )),
      ('restaurant_payout_restrict', EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'RestaurantPayout'
          AND c.conname = 'RestaurantPayout_restaurantId_fkey' AND c.contype = 'f' AND c.confdeltype = 'r'
      )),
      ('customer_push_tables', (
        SELECT COUNT(*) = 4 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name IN (
          'DeviceInstallation', 'DeviceOrderSubscription', 'NotificationOutbox', 'NotificationDelivery'
        )
      )),
      ('device_installation_security', (
        SELECT COUNT(*) = 5 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'DeviceInstallation'
          AND column_name IN ('provider', 'tokenCiphertext', 'tokenHash', 'active', 'lastSeenAt')
      )),
      ('device_installation_unique', EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'DeviceInstallation_provider_installationId_key'
      )),
      ('notification_outbox_lease', (
        SELECT COUNT(*) = 6 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'NotificationOutbox'
          AND column_name IN ('dedupeKey', 'status', 'availableAt', 'leaseOwner', 'leaseExpiresAt', 'attemptCount')
      )),
      ('notification_outbox_dedupe', EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname = 'NotificationOutbox_dedupeKey_key'
      )),
      ('order_hard_delete_guard', EXISTS (
        SELECT 1 FROM pg_trigger tr
        JOIN pg_class t ON t.oid = tr.tgrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'Order'
          AND tr.tgname = 'Order_block_hard_delete' AND NOT tr.tgisinternal AND tr.tgenabled <> 'D'
      )),
      ('refund_ledger_columns', (
        SELECT COUNT(*) = 19 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'PaymentRefund'
          AND column_name IN (
            'id', 'orderId', 'provider', 'paymentRef', 'refundRef', 'idempotencyKey',
            'amount', 'cumulativeAmount', 'status', 'source', 'actorAdminId', 'reason',
            'providerCreatedAt', 'firstSeenAt', 'lastSeenAt', 'completedAt', 'failedAt',
            'createdAt', 'updatedAt'
          )
      )),
      ('refund_ledger_indexes', (
        SELECT COUNT(*) = 4 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname IN (
          'PaymentRefund_idempotencyKey_key',
          'PaymentRefund_provider_refundRef_key',
          'PaymentRefund_orderId_createdAt_idx',
          'PaymentRefund_provider_status_lastSeenAt_idx'
        )
      )),
      ('refund_ledger_restrict', EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'PaymentRefund'
          AND c.conname = 'PaymentRefund_orderId_fkey'
          AND c.contype = 'f' AND c.confdeltype = 'r'
      )),
      ('refund_ledger_checks', (
        SELECT COUNT(*) = 6 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'PaymentRefund'
          AND c.conname IN (
            'PaymentRefund_amount_check', 'PaymentRefund_provider_check',
            'PaymentRefund_status_check', 'PaymentRefund_source_check',
            'PaymentRefund_refs_nonblank_check',
            'PaymentRefund_lifecycle_timestamps_check'
          ) AND c.contype = 'c'
      )),
      ('refund_ledger_guards', (
        SELECT COUNT(*) = 2 FROM pg_trigger tr
        JOIN pg_class t ON t.oid = tr.tgrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'PaymentRefund'
          AND tr.tgname IN (
            'PaymentRefund_validate_update',
            'PaymentRefund_block_hard_delete'
          ) AND NOT tr.tgisinternal AND tr.tgenabled <> 'D'
      )),
      ('refund_ledger_history_complete', NOT EXISTS (
        SELECT 1 FROM "Order" o
        CROSS JOIN LATERAL (
          SELECT
            COALESCE(SUM(r."amount") FILTER (WHERE r."status" = 'REFUNDED'), 0) AS successful_amount,
            COUNT(*) FILTER (
              WHERE r."status" IN ('REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING', 'UNKNOWN')
            ) AS active_count
          FROM "PaymentRefund" r
          WHERE r."orderId" = o."id"
        ) ledger
        WHERE ledger.successful_amount <> COALESCE(o."refundAmount", 0)
          OR CASE UPPER(o."paymentStatus")
            WHEN 'PAID' THEN
              COALESCE(o."refundAmount", 0) <> 0
              OR ledger.successful_amount <> 0
              OR ledger.active_count <> 0
            WHEN 'PARTIALLY_REFUNDED' THEN
              o."refundAmount" IS NULL
              OR o."refundAmount" <= 0
              OR o."refundAmount" >= o."total"
              OR ledger.active_count <> 0
            WHEN 'REFUNDED' THEN
              o."refundAmount" IS NULL
              OR o."refundAmount" <> o."total"
              OR ledger.successful_amount <> o."total"
              OR ledger.active_count <> 0
            WHEN 'REFUNDING' THEN
              COALESCE(o."refundAmount", 0) < 0
              OR COALESCE(o."refundAmount", 0) >= o."total"
              OR ledger.active_count = 0
            ELSE
              COALESCE(o."refundAmount", 0) <> 0
              OR ledger.successful_amount <> 0
              OR ledger.active_count <> 0
          END
      )),
      ('payout_hard_delete_guard', EXISTS (
        SELECT 1 FROM pg_trigger tr
        JOIN pg_class t ON t.oid = tr.tgrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'RestaurantPayout'
          AND tr.tgname = 'RestaurantPayout_block_hard_delete' AND NOT tr.tgisinternal AND tr.tgenabled <> 'D'
      )),
      ('payout_recovery_columns', (
        SELECT COUNT(*) = 8 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'RestaurantPayout'
          AND column_name IN (
            'manualAdjustmentAmount', 'lateRefundAdjustmentAmount',
            'commissionPctSnapshot', 'feeVatPctSnapshot', 'selfDeliverySnapshot',
            'foodVatAmount', 'platformTipAmount', 'foodVatPctSnapshot'
          )
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'RestaurantPayout'
          AND column_name = 'adjustmentAmount'
      )),
      ('payout_recovery_table', (
        SELECT COUNT(*) = 8 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'PayoutRecoveryAllocation'
          AND column_name IN (
            'sourcePayoutId', 'targetPayoutId', 'amount', 'status',
            'reservedAt', 'appliedAt', 'releasedAt', 'releaseReason'
          )
      )),
      ('payout_recovery_indexes', (
        SELECT COUNT(*) = 3 FROM pg_indexes
        WHERE schemaname = current_schema() AND indexname IN (
          'PayoutRecoveryAllocation_sourcePayoutId_targetPayoutId_key',
          'PayoutRecoveryAllocation_sourcePayoutId_status_idx',
          'PayoutRecoveryAllocation_targetPayoutId_status_idx'
        )
      )),
      ('payout_recovery_restrict', (
        SELECT COUNT(*) = 2 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'PayoutRecoveryAllocation'
          AND c.conname IN (
            'PayoutRecoveryAllocation_sourcePayoutId_fkey',
            'PayoutRecoveryAllocation_targetPayoutId_fkey'
          ) AND c.contype = 'f' AND c.confdeltype = 'r'
      )),
      ('payout_recovery_guards', (
        SELECT COUNT(*) = 2 FROM pg_trigger tr
        JOIN pg_class t ON t.oid = tr.tgrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema() AND t.relname = 'PayoutRecoveryAllocation'
          AND tr.tgname IN (
            'PayoutRecoveryAllocation_validate',
            'PayoutRecoveryAllocation_block_hard_delete'
          ) AND NOT tr.tgisinternal AND tr.tgenabled <> 'D'
      )),
      ('paid_payout_snapshots_complete', NOT EXISTS (
        SELECT 1 FROM "RestaurantPayout" p
        WHERE UPPER(p."status") = 'PAID' AND (
          (to_jsonb(p) ->> 'commissionPctSnapshot') IS NULL OR
          (to_jsonb(p) ->> 'feeVatPctSnapshot') IS NULL OR
          (to_jsonb(p) ->> 'selfDeliverySnapshot') IS NULL
        )
      )),
      ('launch_event_absent', NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'LaunchEvent'
      )),
      ('guest_notification_nullable', (
        SELECT COUNT(*) = 2 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND ((table_name = 'DeviceInstallation' AND column_name = 'userId' AND is_nullable = 'YES')
            OR (table_name = 'NotificationOutbox' AND column_name = 'userId' AND is_nullable = 'YES'))
      ))
    ) AS launch_schema_checks(key, ok)
  `;

  return launchDatabaseSchemaIssues(checks);
}
