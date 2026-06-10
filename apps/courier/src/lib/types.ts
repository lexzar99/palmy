export type VehicleType = "BIKE" | "CAR";
export type DeliveryStatus = "EN_ROUTE_PICKUP" | "PICKED_UP" | "DELIVERED";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OrderItem {
  qty: number;
  name: string;
}

export interface Job {
  id: string;
  orderNumber: string;
  city: string; // stad-koppling: order skickas bara till bud i samma stad
  restaurantName: string;
  pickupAddress: string;
  pickup: LatLng;
  dropoffName: string;
  dropoffAddress: string;
  dropoff: LatLng;
  distanceKm: number;
  etaMin: number; // uppskattad körtid i minuter
  vehicle: VehicleType;
  payout: number; // kr (inkl. ev. dricks)
  tip: number; // kr
  expiresAt: number; // epoch ms
  items: OrderItem[];
}

export interface ActiveDelivery extends Job {
  status: DeliveryStatus;
  acceptedAt: number;
}

export interface HistoryOrder {
  id: string;
  orderNumber: string;
  restaurantName: string;
  deliveredAt: string; // ISO
  distanceKm: number;
  payout: number; // kr
}

export interface CourierProfile {
  id: string;
  name: string;
  email: string;
  city: string;
  vehicle: VehicleType;
  phone?: string;
}

export const MAX_ACTIVE = 3;

export interface DropoffProof {
  method: "HANDED" | "LEFT_AT_DOOR";
  photoDataUrl?: string | null;
}
