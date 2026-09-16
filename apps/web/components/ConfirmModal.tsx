"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle } from "lucide-react";
import "@/components/restaurant/restaurant.css";

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
        <div className="ve-root fixed inset-0 z-[1500] flex items-center justify-center p-5" style={{ backgroundColor: "transparent" }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.42)" }}
          />
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full max-w-[360px] rounded-[26px] px-5 pb-5 pt-6"
            style={{ backgroundColor: "var(--ve-card)", boxShadow: "var(--ve-shadow-float)" }}
          >
            <div className="flex flex-col items-center text-center">
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>
                <AlertCircle size={26} strokeWidth={2.2} />
              </span>
              <h3 className="m-0 text-[20px] font-semibold leading-tight" style={{ letterSpacing: "-0.02em", color: "var(--ve-ink)" }}>{title}</h3>
              <p className="m-0 mt-2 text-[15px] leading-[1.45]" style={{ color: "var(--ve-ink-2)" }}>{message}</p>
              <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
                <button
                  onClick={onClose}
                  className="ve-press h-12 rounded-full text-[15px] font-medium"
                  style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className="ve-press h-12 rounded-full text-[15px] font-semibold"
                  style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;
