import { createContext, useContext } from 'react';

export const RestartContext = createContext<() => void>(() => {});
export const useRestartApp = () => useContext(RestartContext);
