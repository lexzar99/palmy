import { FinancePayoutPage } from "@/modules/finance/payout-page";

export default async function RestaurantFinanceDocumentsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ from?: string; to?: string; month?: string; period?: string }>;
}) {
  const { restaurantId } = await params;
  const { from, to, month, period } = await searchParams;
  return (
    <FinancePayoutPage
      restaurantId={restaurantId}
      from={from}
      to={to}
      month={month}
      period={period}
      view="documents"
    />
  );
}
