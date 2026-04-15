import React from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';

interface ProofAttachmentProps {
  src?: string;
  fileName?: string;
  mimeType?: string;
  compact?: boolean;
}

const isImageType = (mimeType?: string, src?: string) => {
  const value = String(mimeType || '').toLowerCase();
  if (value.startsWith('image/')) return true;
  return String(src || '').toLowerCase().startsWith('data:image/');
};

const isPdfType = (mimeType?: string, src?: string) => {
  const value = String(mimeType || '').toLowerCase();
  if (value === 'application/pdf') return true;
  return String(src || '').toLowerCase().startsWith('data:application/pdf');
};

export const ProofAttachment = ({ src, fileName, mimeType, compact = false }: ProofAttachmentProps) => {
  if (!src) return null;

  const displayName = fileName || 'Submitted proof';
  const image = isImageType(mimeType, src);
  const pdf = isPdfType(mimeType, src);

  if (compact) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {image ? <ImageIcon size={13} className="text-blue-500 shrink-0" /> : <FileText size={13} className="text-slate-500 shrink-0" />}
              <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{displayName}</p>
            </div>
            {mimeType && <p className="mt-0.5 text-[10px] text-slate-400 truncate">{mimeType}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <ExternalLink size={11} /> Open
            </a>
            <a
              href={src}
              download={fileName || undefined}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <Download size={11} /> Download
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {image ? <ImageIcon size={14} className="text-blue-500 shrink-0" /> : <FileText size={14} className="text-slate-500 shrink-0" />}
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{displayName}</p>
          </div>
          {mimeType && <p className="mt-0.5 text-[10px] text-slate-400 truncate">{mimeType}</p>}
        </div>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          download={fileName || undefined}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <ExternalLink size={11} /> Open
        </a>
      </div>

      {image ? (
        <a href={src} target="_blank" rel="noreferrer" className="block">
          <img src={src} alt={displayName} className="w-full max-h-56 object-contain rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800" />
        </a>
      ) : pdf ? (
        <object data={src} type="application/pdf" className="w-full h-64 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex h-64 items-center justify-center text-center px-4 text-xs text-slate-500">
            <div>
              <FileText size={22} className="mx-auto mb-2 text-slate-400" />
              <p>PDF preview is not available in this browser.</p>
              <a href={src} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-teal-deep dark:text-teal-green font-bold">
                <Download size={12} /> Open or download the file
              </a>
            </div>
          </div>
        </object>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-4 text-center">
          <FileText size={22} className="mx-auto mb-2 text-slate-400" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">File attached and ready to review</p>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Open the file in a new tab or download it to inspect the proof.</p>
          <div className="mt-3 flex justify-center gap-2">
            <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold bg-teal-deep text-white hover:bg-teal-green">
              <ExternalLink size={11} /> Open file
            </a>
            <a href={src} download={fileName || undefined} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
              <Download size={11} /> Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
};