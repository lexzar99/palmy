import prisma from './prisma';
import type { AuthRequest } from '../middleware/auth';

/**
 * audit() — loggar en admin-handling till AuditLog-tabellen.
 * Fire-and-forget (catch internt) så routes aldrig blockeras av audit-fel.
 *
 * Användning:
 *   await audit(req, 'ORDER_REFUND', { resourceType: 'Order', resourceId: order.id, changes: { amount } });
 */
export async function audit(
  req: AuthRequest,
  action: string,
  details: {
    resourceType: string;
    resourceId?: string | null;
    changes?: unknown;
  },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: req.admin?.id ?? null,
        adminEmail: req.admin?.email ?? null,
        action,
        resourceType: details.resourceType,
        resourceId: details.resourceId ?? null,
        changes: details.changes ? JSON.stringify(details.changes) : null,
        ipAddress: (req.ip || req.headers['x-forwarded-for'] as string || null) as string | null,
        userAgent: (req.headers['user-agent'] || null) as string | null,
      },
    });
  } catch (err) {
    // Audit får aldrig blockera primär route — bara logga och gå vidare
    console.error('[audit] failed to write log:', err);
  }
}
