export function sigBlockHtml(sig: string | null, label: string, date: string | null, printedName?: string, minWidth = 160) {
  return `
    <div style="flex:1;text-align:center;min-width:${minWidth}px;">
      ${label ? `<div style="font-weight:bold;text-align:left;margin-bottom:4px;font-size:11px;">${label}</div>` : ''}
      <div style="min-height:44px;display:flex;align-items:center;justify-content:center;margin-bottom:2px;">
        ${sig ? `<img src="${sig}" style="max-height:44px;max-width:100%;object-fit:contain;display:block;margin:0 auto;" />` : '<div style="width:80%;height:1px;border-bottom:1px solid #000;"></div>'}
      </div>
      ${printedName ? `<div style="font-size:11px;color:#111;font-weight:700;text-align:center;margin-top:0;line-height:1;">${printedName}</div>` : ''}
      ${date ? `<div style="font-size:10px;color:#666;margin-top:2px;">${date}</div>` : ''}
    </div>`;
}
