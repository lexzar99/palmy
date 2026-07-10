import { LoadingPanel, PageHeader } from "@/shared/components/ui";

export default function AdminLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <PageHeader title="Laddar" />
      <LoadingPanel label="Laddar adminvyn…" />
    </div>
  );
}
