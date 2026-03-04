import React, { useRef, useState, useEffect, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { RotateCcw, Check, PenLine, Upload } from 'lucide-react';

interface SignatureUploadProps {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
}

export const SignatureUpload = ({ label, value, onChange }: SignatureUploadProps) => {
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

  const handleSave = () => {
    if (!padRef.current || !hasDrawn) return;
    try {
      const dataUrl = padRef.current.getCanvas().toDataURL('image/png');
      onChange(dataUrl);
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
    onChange('');
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

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</label>

      {/* Saved state — show preview */}
      {value && !signing && mode === null && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-800 flex items-center justify-between gap-2">
          <img src={value} alt="signature" className="max-h-12 object-contain" />
          <button
            type="button"
            onClick={handleRedo}
            title="Re-sign"
            className="text-xs text-slate-400 hover:text-teal-deep dark:hover:text-teal-green flex items-center gap-1 transition-colors shrink-0"
          >
            <RotateCcw size={12} /> Change
          </button>
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
      {signing && mode === 'draw' && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div ref={wrapperRef} className="w-full bg-white" style={{ height: '96px' }}>
            <SignatureCanvas
              ref={padRef}
              penColor="#1e293b"
              minWidth={1.5}
              maxWidth={2.5}
              onBegin={() => setHasDrawn(true)}
              canvasProps={{ style: { touchAction: 'none', display: 'block' } }}
            />
          </div>
          <div className="flex justify-between items-center px-2 py-1 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
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
                onClick={() => { setSigning(false); setMode(null); setHasDrawn(false); }}
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
      )}
    </div>
  );
};
