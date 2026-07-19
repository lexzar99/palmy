"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, X, Info } from "lucide-react";

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
    // I praktiken kan ProductModal/etc användas utanför ToastProvider under
    // dev (storybook, isolerade tester). Fall tillbaka till no-op istället
    // för att krascha rendringen.
    return { toast: () => {} } as ToastContextValue;
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, tone, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Container — fixed top-center på desktop, top-banner på mobil */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[2500] flex flex-col gap-2 items-center pointer-events-none w-full max-w-sm px-4"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 4.5rem)" }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence>
          {items.map((t) => (
            <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" ? AlertCircle : Info;
  // Monokromt kort; ikonen bär tonen. Success får en tunn guld-vänsterkant
  // (touch av guld + emerald-bock) eftersom det är en glad success-notis.
  const iconColor =
    item.tone === "success" ? "text-emerald-500" : item.tone === "error" ? "text-rose-500" : "text-[color:var(--text-secondary)]";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
      className="pointer-events-auto flex items-center gap-3 w-full rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-muted)",
        borderLeft: item.tone === "success" ? "3px solid var(--color-gold-500, #F0531C)" : undefined,
      }}
    >
      <Icon size={20} strokeWidth={2.5} className={`shrink-0 ${iconColor}`} />
      <p className="flex-1 text-[14px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        {item.message}
      </p>
      <button
        onClick={onDismiss}
        aria-label="Stäng notis"
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
