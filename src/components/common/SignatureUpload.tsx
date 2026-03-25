import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import SignatureCanvas from 'react-signature-canvas';
import { RotateCcw, Check, PenLine, Upload, X } from 'lucide-react';
import { getAuthHeaders } from '../../utils/csv';

interface SignatureUploadProps {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
}

export const SignatureUpload = ({ label, value, onChange }: SignatureUploadProps) => {
  const penCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M4 20l4.2-1.1 10-10a1.4 1.4 0 0 0 0-2L17.1 5.8a1.4 1.4 0 0 0-2 0l-10 10L4 20z' fill='%231e293b'/%3E%3Cpath d='M13.8 6.2l4 4' stroke='%23ffffff' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E") 2 22, crosshair`;
  const drawCanvasHeight = 220;
  const padRef = useRef<SignatureCanvas>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [signing, setSigning] = useState(false);
  const [mode, setMode] = useState<'draw' | 'upload' | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Resize canvas to match wrapper dimensions so drawing coordinates are correct
  const resizeCanvas = useCallback(() => {
    if (!wrapperRef.current || !padRef.current) return;
    const canvas = padRef.current.getCanvas();
    const wrapper = wrapperRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = wrapper.offsetWidth * ratio;
    canvas.height = wrapper.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, wrapper.offsetWidth, wrapper.offsetHeight);
    }
    canvas.style.width = wrapper.offsetWidth + 'px';
    canvas.style.height = wrapper.offsetHeight + 'px';
  }, []);

  useEffect(() => {
    if (signing && mode === 'draw') {
      // Small delay to let the DOM render the canvas wrapper first
      const timer = setTimeout(() => resizeCanvas(), 50);
      window.addEventListener('resize', resizeCanvas);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', resizeCanvas);
      };
    }
  }, [signing, mode, resizeCanvas]);

  useEffect(() => {
    if (signing && mode === 'draw') {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [signing, mode]);

  const handleSave = () => {
    if (!padRef.current || !hasDrawn) return;
    try {
      // Export a higher-resolution PNG so printed/scaled signatures remain crisp.
      const orig = padRef.current.getCanvas();
      const scale = Math.max(2, Math.round(window.devicePixelRatio || 1));
      const tmp = document.createElement('canvas');
      tmp.width = orig.width * scale;
      tmp.height = orig.height * scale;
      const tctx = tmp.getContext('2d');
        if (tctx) {
        // white background
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, tmp.width, tmp.height);
        // draw scaled
        tctx.scale(scale, scale);
        tctx.drawImage(orig, 0, 0);
        const dataUrl = tmp.toDataURL('image/png');
        onChange(dataUrl);
        // Log activity: signature saved
        try {
          const headers = getAuthHeaders();
          if (headers['Authorization']) {
            fetch('/api/activity', { method: 'POST', headers, body: JSON.stringify({ action: 'signature_saved', description: label, entity: 'signature', meta: { source: 'SignatureUpload', label } }) }).catch(() => {});
          }
        } catch {}
      } else {
        const dataUrl = padRef.current.getCanvas().toDataURL('image/png');
        onChange(dataUrl);
        try {
          const headers = getAuthHeaders();
          if (headers['Authorization']) {
            fetch('/api/activity', { method: 'POST', headers, body: JSON.stringify({ action: 'signature_saved', description: label, entity: 'signature', meta: { source: 'SignatureUpload', label } }) }).catch(() => {});
          }
        } catch {}
      }
    } catch {
      // Fallback
      try { onChange(padRef.current.toDataURL('image/png')); } catch {}
    }
    setSigning(false);
    setMode(null);
    setHasDrawn(false);
  };

  const handleClear = () => {
    padRef.current?.clear();
    setHasDrawn(false);
    // Refill white background after clearing
    setTimeout(() => {
      if (!padRef.current || !wrapperRef.current) return;
      const canvas = padRef.current.getCanvas();
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }, 10);
  };

  const handleRedo = () => {
    setMode('draw');
    setSigning(true);
    setHasDrawn(false);
  };

  const handleClearSaved = () => {
    onChange('');
    setSigning(false);
    setMode(null);
    setHasDrawn(false);
  };

  const closeDrawModal = () => {
    setSigning(false);
    setMode(null);
    setHasDrawn(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      (window as any).notify?.('Please upload an image file (PNG, JPG, etc.)', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      (window as any).notify?.('Image must be under 5MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
      setMode(null);
    };
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const drawModal = signing && mode === 'draw' ? (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] px-4" onClick={closeDrawModal}>
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-full border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
          <div ref={wrapperRef} className="w-full bg-white dark:bg-slate-900" style={{ height: `${drawCanvasHeight}px`, cursor: penCursor }}>
            <SignatureCanvas
              ref={padRef}
              penColor="#1e293b"
              minWidth={1.5}
              maxWidth={2.5}
              onBegin={() => setHasDrawn(true)}
              canvasProps={{ style: { touchAction: 'none', display: 'block', cursor: penCursor } }}
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-center text-slate-500 dark:text-slate-400">Draw your signature inside the centered box</p>
        <div className="flex justify-between items-center px-2 py-1.5 mt-2 border border-slate-100 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={10} /> Clear
            </button>
            <button
              type="button"
              onClick={closeDrawModal}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className={`text-[10px] px-3 py-1 rounded-lg flex items-center gap-1 transition-colors ${hasDrawn ? 'bg-teal-deep text-white hover:bg-teal-green' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'}`}
          >
            <Check size={10} /> Save Signature
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</label>

      {/* Saved state — show preview */}
      {value && !signing && mode === null && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 flex flex-col items-center gap-2">
          <img src={value} alt="signature" className="max-h-12 object-contain" />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRedo}
              title="Re-sign"
              className="text-xs text-slate-400 hover:text-teal-deep dark:hover:text-teal-green flex items-center gap-1 transition-colors shrink-0"
            >
              <RotateCcw size={12} /> Change
            </button>
            <button
              type="button"
              onClick={handleClearSaved}
              title="Clear signature"
              className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors shrink-0"
            >
              <X size={12} /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Mode chooser — Draw or Upload */}
      {!value && mode === null && !signing && (
        <div className="border border-dashed border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center gap-4 h-14">
          <button
            type="button"
            onClick={() => { setMode('draw'); setSigning(true); }}
            className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <PenLine size={14} /> Draw signature
          </button>
          <span className="text-slate-300 dark:text-slate-600 text-xs">or</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-teal-deep dark:hover:text-teal-green transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Upload size={14} /> Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </div>
      )}

      {/* Canvas pad for drawing */}
      {typeof document !== 'undefined' && drawModal ? createPortal(drawModal, document.body) : null}
    </div>
  );
};
