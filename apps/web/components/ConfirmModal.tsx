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
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-sm bg-zinc-900 border border-white/5 rounded-[2rem] p-8 shadow-2xl overflow-hidden shadow-xl"
          >
            {/* Background design element */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-gold-500/10 rounded-full blur-3xl" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-gold-400/20 rounded-2xl flex items-center justify-center text-gold-600 mb-6 border border-gold-500/20 shadow-xl">
                <AlertCircle size={32} />
              </div>
              
              <h3 className="text-2xl font-black uppercase tracking-tight mb-2 text-zinc-100">{title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed mb-8 font-medium">{message}</p>
              
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={onClose}
                  className="px-6 py-4 rounded-xl border border-white/5 bg-zinc-950 text-zinc-400 text-xs font-black uppercase tracking-widest hover:bg-zinc-800/50 transition-all shadow-xl"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className="px-6 py-4 rounded-xl bg-gold-500 text-white text-xs font-black uppercase tracking-widest hover:bg-gold-600 transition-all shadow-lg shadow-gold-500/20"
                >
                  {confirmText}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-zinc-400/20 hover:text-zinc-100 transition-colors"
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
