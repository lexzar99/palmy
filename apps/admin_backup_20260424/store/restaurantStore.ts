import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RestaurantState {
  selectedRestaurantId: string | null;
  selectedRestaurantName: string | null;
  setRestaurant: (id: string | null, name: string | null) => void;
}

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set) => ({
      selectedRestaurantId: null,
      selectedRestaurantName: null,
      setRestaurant: (id, name) => set({ selectedRestaurantId: id, selectedRestaurantName: name }),
    }),
    {
      name: "admin-restaurant-storage",
    }
  )
);
