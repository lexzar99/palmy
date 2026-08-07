import { FinanceTermsPage } from "@/modules/finance/terms-page";

export default async function FinanceTermsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ from?: string; to?: string; month?: string; period?: string }>;
}) {
  const { restaurantId } = await params;
  const { from, to, month, period } = await searchParams;

  return (
    <FinanceTermsPage
      restaurantId={restaurantId}
      from={from}
      to={to}
      month={month}
      period={period}
    />
  );
}
