import { reconcileRecentCustomerOrderNotifications } from './customerNotificationReconciler';
import { revokeExpiredOrderScopedInstallations } from './deviceInstallations';
import { dispatchNotificationOutboxBatch } from './notificationOutbox';

export type CustomerNotificationWorkerName = 'outbox' | 'reconciler' | 'prune';

export type CustomerNotificationWorkerHeartbeat = {
  running: boolean;
  lastStartedAt: number | null;
  lastSucceededAt: number | null;
  lastFailedAt: number | null;
  consecutiveFailures: number;
  lastError: string | null;
};

export type CustomerNotificationWorkerSnapshot = {
  startedAt: number | null;
  workers: Record<CustomerNotificationWorkerName, CustomerNotificationWorkerHeartbeat>;
};

type WorkerSpec = {
  intervalMs: number;
  startupGraceMs: number;
  maxStaleMs: number;
  maxRunMs: number;
};

const SPECS: Record<CustomerNotificationWorkerName, WorkerSpec> = {
  outbox: { intervalMs: 5_000, startupGraceMs: 2 * 60_000, maxStaleMs: 5 * 60_000, maxRunMs: 5 * 60_000 },
  reconciler: { intervalMs: 60_000, startupGraceMs: 3 * 60_000, maxStaleMs: 10 * 60_000, maxRunMs: 10 * 60_000 },
  prune: { intervalMs: 60 * 60_000, startupGraceMs: 5 * 60_000, maxStaleMs: 2 * 60 * 60_000, maxRunMs: 15 * 60_000 },
};

const emptyHeartbeat = (): CustomerNotificationWorkerHeartbeat => ({
  running: false,
  lastStartedAt: null,
  lastSucceededAt: null,
  lastFailedAt: null,
  consecutiveFailures: 0,
  lastError: null,
});

const state: CustomerNotificationWorkerSnapshot = {
  startedAt: null,
  workers: {
    outbox: emptyHeartbeat(),
    reconciler: emptyHeartbeat(),
    prune: emptyHeartbeat(),
  },
};

export function getCustomerNotificationWorkerSnapshot(): CustomerNotificationWorkerSnapshot {
  return {
    startedAt: state.startedAt,
    workers: {
      outbox: { ...state.workers.outbox },
      reconciler: { ...state.workers.reconciler },
      prune: { ...state.workers.prune },
    },
  };
}

export function evaluateCustomerNotificationWorkerHealth(
  snapshot: CustomerNotificationWorkerSnapshot,
  now = Date.now(),
): Array<{ key: string; message: string }> {
  if (!snapshot.startedAt) {
    return [{ key: 'notification_workers_not_started', message: 'Kundnotifieringsworkers har inte startats' }];
  }
  const issues: Array<{ key: string; message: string }> = [];
  for (const name of Object.keys(SPECS) as CustomerNotificationWorkerName[]) {
    const worker = snapshot.workers[name];
    const spec = SPECS[name];
    const key = `notification_worker_${name}`;
    if (!worker.lastSucceededAt && now - snapshot.startedAt > spec.startupGraceMs) {
      issues.push({ key, message: `Notifieringsworker ${name} har ännu ingen lyckad heartbeat` });
      continue;
    }
    if (worker.lastSucceededAt && now - worker.lastSucceededAt > spec.maxStaleMs) {
      issues.push({ key, message: `Notifieringsworker ${name} har en för gammal heartbeat` });
      continue;
    }
    if (worker.running && worker.lastStartedAt && now - worker.lastStartedAt > spec.maxRunMs) {
      issues.push({ key, message: `Notifieringsworker ${name} har fastnat i en körning` });
      continue;
    }
    if (worker.consecutiveFailures >= 3) {
      issues.push({ key, message: `Notifieringsworker ${name} har misslyckats tre gånger i rad` });
    }
  }
  return issues;
}

export function getCustomerNotificationWorkerIssues(now = Date.now()) {
  return evaluateCustomerNotificationWorkerHealth(getCustomerNotificationWorkerSnapshot(), now);
}

async function runWorker(name: CustomerNotificationWorkerName, task: () => Promise<void>): Promise<void> {
  const heartbeat = state.workers[name];
  if (heartbeat.running) return;
  heartbeat.running = true;
  heartbeat.lastStartedAt = Date.now();
  try {
    await task();
    heartbeat.lastSucceededAt = Date.now();
    heartbeat.consecutiveFailures = 0;
    heartbeat.lastError = null;
  } catch (error) {
    heartbeat.lastFailedAt = Date.now();
    heartbeat.consecutiveFailures += 1;
    heartbeat.lastError = String((error as Error)?.message || error).slice(0, 240);
    console.error(`[customerNotificationWorkers] ${name} failed:`, error);
  } finally {
    heartbeat.running = false;
  }
}

function schedule(name: CustomerNotificationWorkerName, task: () => Promise<void>): void {
  void runWorker(name, task);
  const timer = setInterval(() => { void runWorker(name, task); }, SPECS[name].intervalMs);
  timer.unref();
}

/** Critical workers are started independently from unrelated best-effort boot. */
export function startCustomerNotificationWorkers(): void {
  if (state.startedAt) return;
  state.startedAt = Date.now();
  schedule('outbox', async () => {
    await dispatchNotificationOutboxBatch(25);
  });
  schedule('reconciler', async () => {
    const result = await reconcileRecentCustomerOrderNotifications();
    if (result.created > 0 || result.errors > 0) {
      console.log('[customerNotificationReconciler]', result);
    }
    if (result.errors > 0) throw new Error(`${result.errors} notifieringsreparationer misslyckades`);
  });
  schedule('prune', async () => {
    const count = await revokeExpiredOrderScopedInstallations();
    if (count > 0) console.log(`[notificationOutbox] revoked ${count} expired order-scoped installations`);
  });
}
