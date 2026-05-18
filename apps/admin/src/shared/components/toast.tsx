"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

/**
 * Lightweight global toast-system för admin.
 *
 * - `showToast({ type, message })` från vilken komponent som helst (via useToast).
 * - Toasts auto-fade efter 3s. Kan stängas manuellt med X.
 * - Stackar nere till höger så flera kan visas samtidigt utan att överlappa.
 * - Inga externa libs (react-hot-toast, sonner etc) — håll bundle slim.
 */

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (input: { type?: ToastType; message: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback för utvecklingsläge om provider saknas — slipper crash.
    return { showToast: ({ message }) => console.log("[Toast]", message) };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback<ToastContextValue["showToast"]>(({ type = "success", message }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, type, message }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Enter-animation via CSS — fade + slide-up. Använder useState för att
  // trigga klass-byte efter mount (annars syns inte transition från initial).
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const enterFrame = window.requestAnimationFrame(() => setEntered(true));
    const dismissTimer = window.setTimeout(onDismiss, 3000);
    return () => {
      window.cancelAnimationFrame(enterFrame);
      window.clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  const styles = {
    success: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", text: "#34d399", Icon: CheckCircle2 },
    error: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)", text: "#f87171", Icon: AlertCircle },
    info: { bg: "rgba(94,166,255,0.12)", border: "rgba(94,166,255,0.35)", text: "#93c5fd", Icon: CheckCircle2 },
  }[toast.type];

  const Icon = styles.Icon;

  return (
    <div
      className="pointer-events-auto rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 min-w-[280px] max-w-[420px] transition-all duration-200 ease-out"
      style={{
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
        backdropFilter: "blur(8px)",
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(12px)",
      }}
    >
      <Icon size={18} className="shrink-0" style={{ color: styles.text }} strokeWidth={2.4} />
      <p className="flex-1 text-sm font-bold leading-snug" style={{ color: styles.text }}>{toast.message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: styles.text }}
        aria-label="Stäng"
      >
        <X size={14} />
      </button>
    </div>
  );
}
