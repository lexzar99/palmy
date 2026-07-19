import prisma from './prisma';

/**
 * Tar bort exakt den syntetiska terminalorder som POST /api/terminal/test-order
 * skapar. Alla markörer måste matcha både här och i databasens DELETE-trigger;
 * ett vanligt order-id kan därför aldrig hårdraderas genom hjälpen.
 */
export async function deleteServerTerminalTestOrder(orderId: string): Promise<boolean> {
  const deleted = await prisma.$executeRaw`
    DELETE FROM "Order"
    WHERE "id" = ${orderId}
      AND "orderNumber" LIKE 'TEST-%'
      AND "customerName" = 'SERVERTEST'
      AND "stripePaymentIntentId" = 'TEST_PAYMENT'
      AND LOWER(COALESCE("discountCode", '')) IN ('test', 'testa')
      AND "paymentMethod" = 'TEST'
  `;
  return deleted === 1;
}
