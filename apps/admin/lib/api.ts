export const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Fallback for client-side
  if (typeof window !== "undefined") {
    // If the site is accessed via a hostname (e.g., 192.168.0.x or palmyra.local), 
    // we should try to use that same hostname for the API on port 4000
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

