import MenuContent from "@/components/MenuContent";

export default function RestaurantPage({ params }: { params: { slug: string } }) {
  const { slug } = params;

  return (
    <div className="min-h-screen bg-[#050505]">
      <MenuContent restaurantSlug={slug} isStandalone={true} />
    </div>
  );
}
