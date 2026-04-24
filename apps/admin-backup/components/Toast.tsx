"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info", duration = 3500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const success = useCallback((msg: string) => toast(msg, "success"), [toast]);
  const error = useCallback((msg: string) => toast(msg, "error", 5000), [toast]);
  const warning = useCallback((msg: string) => toast(msg, "warning"), [toast]);
  const info = useCallback((msg: string) => toast(msg, "info"), [toast]);

  const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertCircle, info: Info };
  const COLORS = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    error: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    info: "border-gold-500/40 bg-gold-500/10 text-gold-500",
  };

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[999] flex flex-col gap-3 pointer-events-none" style={{ maxWidth: 380 }}>
        <AnimatePresence>
          {toasts.map(t => {
            const Icon = ICONS[t.type];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                className={`pointer-events-auto flex items-start gap-4 px-5 py-4 rounded-2xl border backdrop-blur-xl shadow-2xl shadow-black/40 ${COLORS[t.type]}`}
                style={{ background: "var(--bg-secondary)" }}
              >
                <Icon size={18} className="mt-0.5 shrink-0" />
                <p className="text-[12px] font-bold text-[var(--text-primary)] leading-relaxed flex-1">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mt-0.5"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
