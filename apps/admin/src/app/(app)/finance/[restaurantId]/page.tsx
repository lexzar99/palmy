import { FinancePayoutPage } from "@/modules/finance/payout-page";

export default async function PayoutRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}) {
  const { restaurantId } = await params;
  const { from, to, period } = await searchParams;
  return <FinancePayoutPage restaurantId={restaurantId} from={from} to={to} period={period} />;
}
