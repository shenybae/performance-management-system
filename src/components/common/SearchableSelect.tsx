import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  allowEmpty = false,
  emptyLabel = 'All'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);
  const [portalStyle, setPortalStyle] = useState<{ left: number; top: number; width?: number }>({ left: 0, top: 0 });

  const selectedLabel = useMemo(() => {
    if (!value && allowEmpty) return emptyLabel;
    return options.find(o => o.value === value)?.label || '';
  }, [value, options, allowEmpty, emptyLabel]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // If click is inside the trigger container or inside the portal dropdown, ignore
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (portalEl && portalEl.contains(target)) return;
      setIsOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [portalEl]);

  useEffect(() => {
    if (!isOpen) return;
    if (!inputRef.current) return;
    const el = inputRef.current as HTMLInputElement;
    try {
      // Modern browsers: focus without scrolling
      el.focus({ preventScroll: true } as any);
    } catch {
      // Older browsers: focus then restore the scroll position to avoid page jump
      const sx = window.scrollX || window.pageXOffset;
      const sy = window.scrollY || window.pageYOffset;
      el.focus();
      setTimeout(() => window.scrollTo(sx, sy), 0);
    }
  }, [isOpen]);

  // Portal element lifecycle
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'searchable-select-portal-root';
    document.body.appendChild(el);
    setPortalEl(el);
    return () => {
      try { document.body.removeChild(el); } catch {};
      setPortalEl(null);
    };
  }, []);

  // Update portal position so dropdown aligns with the trigger button
  const updatePortalPosition = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Use viewport coordinates so the portal can be fixed and won't affect page layout
    setPortalStyle({ left: Math.max(8, rect.left), top: rect.bottom });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePortalPosition();
    window.addEventListener('resize', updatePortalPosition);
    window.addEventListener('scroll', updatePortalPosition, true);
    return () => {
      window.removeEventListener('resize', updatePortalPosition);
      window.removeEventListener('scroll', updatePortalPosition, true);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className="w-full flex items-center justify-between p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm text-left transition-colors hover:border-slate-300 dark:hover:border-slate-600 focus:ring-2 focus:ring-teal-green/50 outline-none"
      >
        <span className={value || allowEmpty ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && portalEl && createPortal(
        <div
          style={{ left: portalStyle.left, top: portalStyle.top, position: 'fixed' }}
          className="z-[9999] min-w-[12rem] max-w-[30rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden pointer-events-auto"
        >
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-md">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 outline-none placeholder-slate-400"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
                className={`w-full text-left px-5 py-2 text-sm transition-colors ${
                  !value ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 font-bold' : 'text-slate-600 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-400 italic">No matches found</div>
            )}
            {filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(''); }}
                className={`w-full text-left px-5 py-2 text-sm transition-colors ${
                  opt.value === value
                    ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 font-bold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>,
        portalEl
      )}
    </div>
  );
};
