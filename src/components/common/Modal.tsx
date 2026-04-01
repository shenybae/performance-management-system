import React from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children?: React.ReactNode;
  maxWidthClassName?: string;
  bodyClassName?: string;
}

export const Modal = ({ open, title, onClose, children, maxWidthClassName = 'max-w-lg', bodyClassName = '' }: ModalProps) => {
  if (!open) return null;
  const el = document.body;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${maxWidthClassName}`}>
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="m-0 text-base sm:text-lg leading-6 font-black tracking-tight text-slate-800 dark:text-slate-100">{title}</h3>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close dialog"
            >
              ✕
            </button>
          </div>
          <div className={`px-5 py-5 max-h-[80vh] overflow-y-auto ${bodyClassName}`}>{children}</div>
        </div>
      </div>
    </div>
  , el);
};

export default Modal;
