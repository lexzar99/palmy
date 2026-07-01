import { AutoCampaignFormPage } from "@/modules/deals/auto-campaign-form-page";

export default async function EditAutoCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AutoCampaignFormPage campaignId={id} />;
}
