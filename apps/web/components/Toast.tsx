"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, AlertCircle, Info } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // ProductSheet m.fl. kan renderas utanför ToastProvider i isolerade
    // tester — fall tillbaka till no-op i stället för att krascha.
    return { toast: () => {} } as ToastContextValue;
  }
  return ctx;
}

// Samma typsnittsstack som designsystemet (docs/DESIGN_SYSTEM.md) — toasten
// är global och kan inte förlita sig på att .ve-root finns på sidan.
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Helvetica Neue", system-ui, sans-serif';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    // En notis i taget: en ny ersätter den gamla i stället för att stapla.
    setItems([{ id, tone, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed inset-x-0 z-[2500] flex flex-col items-center gap-2 pointer-events-none px-4"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)", fontFamily: FONT }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((t) => (
            <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Toast — mörk glaspill högst upp, ikon i tonad rund platta, vit text.
 * Fjädrar ner från kanten, försvinner efter 2,6 s eller vid tryck.
 */
function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2600);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const Icon = item.tone === "success" ? Check : item.tone === "error" ? AlertCircle : Info;
  const iconBg = item.tone === "success" ? "#30D158" : item.tone === "error" ? "#FF453A" : "rgba(255,255,255,0.22)";

  return (
    <motion.button
      type="button"
      layout
      onClick={onDismiss}
      initial={{ opacity: 0, y: -24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 520, damping: 34 }}
      className="pointer-events-auto flex items-center gap-3 max-w-[92vw] sm:max-w-sm min-h-[48px] pl-2 pr-5 py-2 rounded-full text-left"
      style={{
        backgroundColor: "rgba(29,29,31,0.92)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.12), 0 16px 40px rgba(0,0,0,0.22)",
        color: "#fff",
        letterSpacing: "-0.01em",
      }}
    >
      <span className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: iconBg }}>
        <Icon size={16} strokeWidth={3} style={{ color: item.tone === "info" ? "#fff" : "#0B0B0C" }} />
      </span>
      <span className="text-[15px] font-semibold leading-snug line-clamp-2">{item.message}</span>
    </motion.button>
  );
}
