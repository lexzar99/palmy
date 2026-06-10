import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { CourierProfile } from "./types";

const TOKEN_KEY = "delivera_courier_token";

interface AuthCtx {
  ready: boolean;
  courier: CourierProfile | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [courier, setCourier] = useState<CourierProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    api
      .profile(token)
      .then(setCourier)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setReady(true));
  }, []);

  const login = async (email: string, password: string) => {
    const { token, courier: c } = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, token);
    setCourier(c);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setCourier(null);
  };

  return <Ctx.Provider value={{ ready, courier, login, logout }}>{children}</Ctx.Provider>;
}
