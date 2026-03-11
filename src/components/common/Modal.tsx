import React from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children?: React.ReactNode;
}

export const Modal = ({ open, title, onClose, children }: ModalProps) => {
  if (!open) return null;
  const el = document.body;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4">
        <div className="glass-card p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  , el);
};

export default Modal;
