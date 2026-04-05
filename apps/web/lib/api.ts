export const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Final fallback (production)
  if (process.env.NODE_ENV === "production" || (typeof window !== "undefined" && !window.location.hostname.includes("localhost"))) {
    return "https://palmy-production-2021.up.railway.app";
  }
 
  // Fallback for client-side local dev
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:4000`;
  }
 
  return "http://localhost:4000";
};

export const getSocketUrl = () => {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }

  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
};

export const API_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

