import { BogoFormPage } from "@/modules/deals/bogo-form-page";

export default function EditBogoPage({ params }: { params: { id: string } }) {
  return <BogoFormPage dealId={params.id} />;
}
