import MenuContent from "@/components/MenuContent";

export default async function RestaurantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="min-h-screen">
      <MenuContent restaurantSlug={slug} isStandalone={true} />
    </div>
  );
}
