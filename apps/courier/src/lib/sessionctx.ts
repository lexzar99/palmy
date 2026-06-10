import { createContext, useContext } from "react";

export interface SessionCtx {
  end: () => Promise<void>;
}

export const SessionContext = createContext<SessionCtx>({ end: async () => {} });
export const useSession = () => useContext(SessionContext);
