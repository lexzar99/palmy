import { FinancePayoutPage } from "@/modules/finance/payout-page";

export default async function PayoutRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { restaurantId } = await params;
  const { from, to } = await searchParams;
  return <FinancePayoutPage restaurantId={restaurantId} from={from} to={to} />;
}
