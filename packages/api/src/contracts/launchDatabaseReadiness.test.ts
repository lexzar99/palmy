import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchDatabaseSchemaIssues } from '../lib/launchDatabaseReadiness';

const allKeys = [
  'restaurant_archived_at',
  'customer_soft_delete',
  'customer_legacy_credentials_absent',
  'order_client_request_id',
  'order_client_request_unique',
  'extra_group_restaurant_index',
  'restaurant_archived_index',
  'category_restaurant_restrict',
  'extra_group_restaurant_restrict',
  'deal_restaurant_restrict',
  'order_restaurant_restrict',
  'product_vat_percent',
  'order_tax_discount_snapshot',
  'order_item_vat_percent',
  'payment_effects_completed_at',
  'payment_provider_without_default',
  'product_vat_check',
  'order_discount_nonnegative_check',
  'order_food_vat_check',
  'order_delivery_vat_check',
  'order_item_vat_check',
  'launch_lead_table',
  'launch_lead_columns',
  'launch_lead_email_unique',
  'launch_lead_coupon_unique',
  'restaurant_payout_restrict',
  'customer_push_tables',
  'device_installation_security',
  'device_installation_unique',
  'notification_outbox_lease',
  'notification_outbox_dedupe',
  'order_hard_delete_guard',
  'refund_ledger_columns',
  'refund_ledger_indexes',
  'refund_ledger_restrict',
  'refund_ledger_checks',
  'refund_ledger_guards',
  'refund_ledger_history_complete',
  'payout_hard_delete_guard',
  'payout_recovery_columns',
  'payout_recovery_table',
  'payout_recovery_indexes',
  'payout_recovery_restrict',
  'payout_recovery_guards',
  'paid_payout_snapshots_complete',
  'launch_event_absent',
  'guest_notification_nullable',
];

assert.deepEqual(
  launchDatabaseSchemaIssues(allKeys.map((key) => ({ key, ok: true }))),
  [],
);

const missing = launchDatabaseSchemaIssues(
  allKeys
    .filter((key) => key !== 'order_client_request_unique')
    .map((key) => ({ key, ok: true })),
);
assert.deepEqual(missing, [{
  key: 'database_schema_order_client_request_unique',
  message: 'Unikt index för Order.clientRequestId saknas',
}]);

const failed = launchDatabaseSchemaIssues(
  allKeys.map((key) => ({ key, ok: key !== 'launch_lead_table' })),
);
assert.deepEqual(failed, [{
  key: 'database_schema_launch_lead_table',
  message: 'LaunchLead-tabellen saknas',
}]);

const readinessSource = readFileSync(
  join(__dirname, '..', 'lib', 'launchDatabaseReadiness.ts'),
  'utf8',
);
assert.match(
  readinessSource,
  /ledger\.successful_amount <> COALESCE\(o\."refundAmount", 0\)/,
  'successful ledger sum must equal Order.refundAmount for every payment status',
);
assert.match(
  readinessSource,
  /WHEN 'PAID'[\s\S]*ledger\.successful_amount <> 0[\s\S]*ledger\.active_count <> 0/,
  'PAID orders must reject both completed and active\/UNKNOWN ledger evidence',
);
assert.match(
  readinessSource,
  /WHEN 'REFUNDING'[\s\S]*ledger\.active_count = 0/,
  'REFUNDING orders must have an active individual ledger lifecycle',
);

console.log('launch database readiness contracts: ok');
