"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
  noPad?: boolean;
}

export function Modal({ open, onClose, title, children, maxWidth = "max-w-xl", noPad }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
            className={`relative w-full ${maxWidth} bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl shadow-black/50 overflow-hidden`}
          >
            {title && (
              <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--border-subtle)]">
                <h2 className="text-base font-black uppercase tracking-wider text-[var(--text-primary)]">{title}</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className={noPad ? "" : "p-8"}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = "Bekräfta", danger, loading }: ConfirmModalProps) {
  const Icon = danger ? Trash2 : CheckCircle2;
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="text-center">
        <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-6 ${danger ? "bg-rose-500/10 text-rose-500" : "bg-gold-500/10 text-gold-500"}`}>
          <Icon size={28} />
        </div>
        <h3 className="text-lg font-black uppercase tracking-tight text-[var(--text-primary)] mb-3">{title}</h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-8">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[11px] font-black uppercase tracking-widest hover:text-[var(--text-primary)] transition-all"
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
              danger
                ? "bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20"
                : "bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] shadow-lg shadow-gold-500/20"
            }`}
          >
            {loading ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
