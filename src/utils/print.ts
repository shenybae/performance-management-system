const normalizeSignatureSrc = (sig: string | null | undefined) => {
  const raw = String(sig || '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw) || /^https?:\/\//i.test(raw)) return raw;
  // Backward-compatible: some stored signatures may be raw base64 without data URI prefix.
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw)) return `data:image/png;base64,${raw.replace(/\s+/g, '')}`;
  return raw;
};

export function sigBlockHtml(sig: string | null, label: string, date: string | null, printedName?: string, minWidth = 160) {
  const signatureSrc = normalizeSignatureSrc(sig);
  return `
    <div style="flex:1;text-align:center;min-width:${Math.max(0, minWidth)}px;max-width:100%;min-inline-size:0;overflow-wrap:anywhere;word-break:break-word;">
      ${label ? `<div style="font-weight:bold;text-align:center;margin-bottom:4px;font-size:11px;line-height:1.2;">${label}</div>` : ''}
      <div style="min-height:52px;display:flex;align-items:center;justify-content:center;margin-bottom:2px;border:1px solid #cbd5e1;border-radius:4px;padding:2px;overflow:hidden;background:#fff;">
        ${signatureSrc ? `<img src="${signatureSrc}" style="max-height:46px;max-width:100%;object-fit:contain;display:block;margin:0 auto;" />` : '<div style="width:80%;height:1px;border-bottom:1px solid #000;"></div>'}
      </div>
      ${printedName ? `<div style="font-size:11px;color:#111;font-weight:700;text-align:center;margin-top:0;line-height:1.2;min-height:24px;overflow-wrap:anywhere;word-break:break-word;">${printedName}</div>` : ''}
      ${date ? `<div style="font-size:10px;color:#666;margin-top:2px;line-height:1.2;">${date}</div>` : ''}
    </div>`;
}
