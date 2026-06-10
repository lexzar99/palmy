import { createContext, useContext } from "react";
import type { LatLng } from "./types";

export const GeoContext = createContext<LatLng | null>(null);
export const useGeo = () => useContext(GeoContext);
