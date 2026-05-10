import { KampanjFormPage } from "@/modules/deals/kampanj-form-page";

export default function EditKampanjPage({ params }: { params: { id: string } }) {
  return <KampanjFormPage dealId={params.id} />;
}
