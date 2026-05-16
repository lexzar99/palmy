import Link from "next/link";
import { StatsTab } from "@/modules/marketing-referrals/page";
import { Button, PageHeader } from "@/shared/components/ui";
import { ArrowLeft } from "lucide-react";

export default function RouteMarketingReferralsStats() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Referral-statistik"
        actions={
          <Link href="/marketing-referrals">
            <Button variant="secondary">
              <ArrowLeft size={14} /> Tillbaka
            </Button>
          </Link>
        }
      />
      <StatsTab />
    </div>
  );
}
