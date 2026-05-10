import { BogoFormPage } from "@/modules/deals/bogo-form-page";

export default async function EditBogoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BogoFormPage dealId={id} />;
}
