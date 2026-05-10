import { KampanjFormPage } from "@/modules/deals/kampanj-form-page";

export default async function EditKampanjPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KampanjFormPage dealId={id} />;
}
