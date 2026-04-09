"use client";

import { motion } from "framer-motion";
import MenuContent from "@/components/MenuContent";

export default async function RestaurantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="min-h-screen"
    >
      <MenuContent restaurantSlug={slug} isStandalone={true} />
    </motion.div>
  );
}
