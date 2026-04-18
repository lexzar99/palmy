"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Fortsätt",
  cancelText = "Avbryt",
}: ConfirmModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-sm rounded-[2rem] p-8 overflow-hidden shadow-2xl"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
          >
            {/* Background design element */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-gold-500/10 rounded-full blur-3xl" />

            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-gold-400/20 rounded-2xl flex items-center justify-center text-gold-600 mb-6 border border-gold-500/20 shadow-xl">
                <AlertCircle size={32} />
              </div>

              <h3 className="text-2xl font-black uppercase tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>{title}</h3>
              <p className="text-sm leading-relaxed mb-8 font-medium" style={{ color: "var(--text-secondary)" }}>{message}</p>

              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={onClose}
                  className="px-6 py-4 rounded-xl border text-xs font-black uppercase tracking-widest hover:opacity-80 transition-all"
                  style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className="px-6 py-4 rounded-xl bg-gold-500 text-zinc-950 text-xs font-black uppercase tracking-widest hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20"
                >
                  {confirmText}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 transition-colors"
              style={{ color: "var(--text-secondary)", opacity: 0.5 }}
            >
              <X size={20} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;
