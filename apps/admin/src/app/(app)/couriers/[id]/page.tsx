import { CourierDetailPage } from "@/modules/couriers/detail-page";

export default async function RouteCourierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourierDetailPage id={id} />;
}
