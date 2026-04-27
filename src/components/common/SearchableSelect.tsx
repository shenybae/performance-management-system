import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import Modal from './Modal';

interface Option {
  value: string | number;
  label: string;
  avatarUrl?: string | null;
}

interface SearchableSelectProps {
  options: Option[];
  value: string | number | Array<string | number>;
  onChange: (value: string | number | Array<string | number>) => void;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  pill?: boolean;
  searchable?: boolean;
  multiSelect?: boolean;
  dropdownVariant?: 'list' | 'pills-horizontal' | 'modal';
  modalTitle?: string;
  modalDescription?: string;
}

const getInitials = (label: string) => {
  return (label || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  allowEmpty = false,
  emptyLabel = 'All',
  pill = false,
  searchable = true,
  multiSelect = false,
  dropdownVariant = 'list',
  modalTitle,
  modalDescription,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);
  const [portalStyle, setPortalStyle] = useState<{ left: number; top?: number; bottom?: number; width?: number; maxHeight?: number }>({ left: 0, top: 0, width: undefined, maxHeight: undefined });
  const optionsMaxHeight = useMemo(() => {
    const popupMax = Number(portalStyle.maxHeight || 0);
    if (!popupMax) return 224;
    const reserved = searchable ? 156 : 108;
    return Math.max(96, popupMax - reserved);
  }, [portalStyle.maxHeight, searchable]);
  const isModalVariant = dropdownVariant === 'modal';
  const titleText = modalTitle || placeholder || 'Select option';

  const selectedOption = useMemo(() => {
    if (multiSelect && Array.isArray(value)) {
      return options.filter(o => value.map(String).includes(String(o.value)));
    }
    return options.find(o => String(o.value) === String(value));
  }, [value, options]);

  const selectedOptions = useMemo(() => {
    if (!multiSelect || !Array.isArray(value)) return [] as Option[];
    const byValue = new Map(options.map((opt) => [String(opt.value), opt]));
    return value
      .map((v) => byValue.get(String(v)))
      .filter((opt): opt is Option => Boolean(opt));
  }, [multiSelect, value, options]);

  const selectedLabel = useMemo(() => {
    if (!value && allowEmpty) return emptyLabel;
    if (multiSelect && Array.isArray(value)) {
      return selectedOptions.map(opt => opt.label).join(', ');
    }
    return (selectedOption as Option | undefined)?.label || '';
  }, [value, allowEmpty, emptyLabel, selectedOption, selectedOptions, multiSelect]);

  const hasAvatarInOptions = useMemo(() => {
    return options.some((o) => Object.prototype.hasOwnProperty.call(o, 'avatarUrl'));
  }, [options]);

  const filtered = useMemo(() => {
    if (!searchable) return options;
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search, searchable]);

  const filteredOptionsOnly = useMemo(() => {
    if (multiSelect && Array.isArray(value)) {
      const selectedSet = new Set(value.map(String));
      return filtered.filter(opt => !selectedSet.has(String(opt.value)));
    }
    return filtered.filter(opt => String(opt.value) !== String(value));
  }, [filtered, value, multiSelect]);

  const isSelected = (optionValue: string | number) => {
    if (multiSelect && Array.isArray(value)) return value.map(String).includes(String(optionValue));
    return String(optionValue) === String(value);
  };

  const toggleMultiValue = (optionValue: string | number) => {
    if (!multiSelect) {
      onChange(optionValue);
      setIsOpen(false);
      setSearch('');
      return;
    }
    const current = Array.isArray(value) ? value.map(String) : [];
    const next = current.includes(String(optionValue))
      ? current.filter(v => v !== String(optionValue))
      : [...current, String(optionValue)];
    onChange(next);
  };

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
    if (!searchable) return;
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
  }, [isOpen, searchable]);

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
    const baseWidth = Math.floor(rect.width);
    const desiredWidth = dropdownVariant === 'pills-horizontal'
      ? Math.max(360, Math.floor(baseWidth * 1.1))
      : Math.max(360, Math.floor(baseWidth * 1.1));
    const maxWidth = Math.max(240, Math.min(760, window.innerWidth - 32));
    const width = Math.min(desiredWidth, maxWidth);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    const margin = 8;
    const gap = 6;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - margin);
    const spaceAbove = Math.max(0, rect.top - margin);
    const desiredHeight = dropdownVariant === 'pills-horizontal' ? 500 : 420;
    const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const available = shouldOpenUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(180, Math.min(desiredHeight, available));

    if (shouldOpenUp) {
      setPortalStyle({
        left,
        bottom: Math.max(margin, window.innerHeight - rect.top + gap),
        top: undefined,
        width,
        maxHeight,
      });
      return;
    }

    setPortalStyle({
      left,
      top: rect.bottom + gap,
      bottom: undefined,
      width,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePortalPosition();
    const handleScroll = (e: Event) => {
      // Ignore scrolls happening inside the dropdown panel itself so we don't
      // keep re-positioning while the user is trying to scroll options.
      const t = e.target as Node | null;
      if (t && portalEl && portalEl.contains(t)) return;
      updatePortalPosition();
    };
    window.addEventListener('resize', updatePortalPosition);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', updatePortalPosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, portalEl]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className={`w-full flex items-center justify-between border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-left transition-colors hover:border-slate-300 dark:hover:border-slate-600 focus:ring-2 focus:ring-teal-green/50 outline-none ${pill ? 'rounded-full px-3 py-2' : 'rounded-lg p-2'}`}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          {multiSelect && Array.isArray(value) ? (
            value.length > 0 ? (
              <span className="flex flex-wrap gap-1.5 max-w-full">
                {value.slice(0, 3).map((v) => {
                  const opt = options.find(o => String(o.value) === String(v));
                  if (!opt) return null;
                  return (
                    <span key={String(v)} className="inline-flex items-center gap-1 rounded-full border border-teal-200 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 px-2 py-1 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                      {hasAvatarInOptions && (
                        opt.avatarUrl ? (
                          <img src={opt.avatarUrl} alt={opt.label} className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-teal-200 dark:bg-teal-800 text-teal-700 dark:text-teal-200 text-[8px] font-black flex items-center justify-center">{getInitials(opt.label)}</span>
                        )
                      )}
                      <span className="max-w-[120px] truncate">{opt.label}</span>
                    </span>
                  );
                })}
                {value.length > 3 && (
                  <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    +{value.length - 3}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 truncate">{placeholder}</span>
            )
          ) : (
            <>
              {hasAvatarInOptions && selectedOption && !Array.isArray(selectedOption) && (
                selectedOption.avatarUrl ? (
                  <img
                    src={selectedOption.avatarUrl}
                    alt={selectedOption.label}
                    className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center border border-slate-200 dark:border-slate-700">
                    {getInitials(selectedOption.label)}
                  </span>
                )
              )}
              <span className={`${value || allowEmpty ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'} truncate`}>
                {selectedLabel || placeholder}
              </span>
            </>
          )}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isModalVariant && (
        <Modal
          open={isOpen}
          title={titleText}
          onClose={() => { setIsOpen(false); setSearch(''); }}
          maxWidthClassName="max-w-4xl"
          bodyClassName="p-0"
        >
          <div className="p-5 space-y-4">
            {modalDescription && <p className="text-xs text-slate-500 dark:text-slate-400">{modalDescription}</p>}
            {searchable && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <Search size={14} className="text-slate-400 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 outline-none placeholder-slate-400"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Options</div>
              <div className="max-h-[58vh] overflow-y-auto pr-1 custom-scrollbar">
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  {allowEmpty && (
                    <button
                      type="button"
                      onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
                      className={`inline-flex min-h-10 w-full items-center rounded-xl border px-3 py-2 text-left text-sm transition-colors ${!value ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-900/20 dark:text-teal-300 font-bold' : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700'}`}
                    >
                      {emptyLabel}
                    </button>
                  )}
                  {filtered.map((opt) => {
                    const selected = isSelected(opt.value);
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => toggleMultiValue(opt.value)}
                        className={`inline-flex min-h-10 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${selected ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-900/20 dark:text-teal-300 font-bold' : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700'}`}
                      >
                        <span className={`h-3 w-3 rounded-full border ${selected ? 'border-teal-500 bg-teal-500 dark:border-teal-400 dark:bg-teal-400' : 'border-slate-300 dark:border-slate-600'}`}>
                          {selected ? <span className="block h-full w-full text-center text-[8px] leading-[10px] text-white">✓</span> : null}
                        </span>
                        <span className="flex items-center gap-2 min-w-0 w-full">
                          {hasAvatarInOptions && (
                            opt.avatarUrl ? (
                              <img src={opt.avatarUrl} alt={opt.label} className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center border border-slate-200 dark:border-slate-700">
                                {getInitials(opt.label)}
                              </span>
                            )
                          )}
                          <span className="truncate">{opt.label}</span>
                        </span>
                      </button>
                    );
                  })}
                  {filtered.length === 0 && !allowEmpty && (
                    <div className="px-3 py-4 text-center text-xs text-slate-400 italic col-span-full">No matches found</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {!isModalVariant && isOpen && portalEl && createPortal(
        <div
          style={{ left: portalStyle.left, top: portalStyle.top, bottom: portalStyle.bottom, width: portalStyle.width, maxHeight: portalStyle.maxHeight, position: 'fixed' }}
          className="z-[9999] flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden pointer-events-auto"
        >
          {searchable && (
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
          )}
          {dropdownVariant === 'pills-horizontal' ? (
            <div className="p-2 space-y-2">
              <div className="rounded-md bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Selected
              </div>
              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {allowEmpty && (
                  <button
                    type="button"
                    onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors ${
                      !value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/25 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full border ${!value ? 'border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400' : 'border-slate-300 dark:border-slate-600'}`}>
                      {!value ? <span className="block h-full w-full text-center text-[8px] leading-[10px] text-white">✓</span> : null}
                    </span>
                    {emptyLabel}
                  </button>
                )}
                {multiSelect && selectedOptions.length > 0 && selectedOptions.map((opt) => {
                  const optValue = String(opt.value);
                  return (
                    <button
                      key={optValue}
                      type="button"
                      onClick={() => toggleMultiValue(opt.value)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-blue-500 bg-blue-50 px-3 text-xs font-bold text-blue-700 dark:border-blue-400 dark:bg-blue-900/25 dark:text-blue-300"
                    >
                      <span className="h-3 w-3 rounded-full border border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400">
                        <span className="block h-full w-full text-center text-[8px] leading-[10px] text-white">✓</span>
                      </span>
                      <span className="max-w-[140px] truncate">{opt.label}</span>
                    </button>
                  );
                })}
                {!multiSelect && !allowEmpty && selectedOption && !Array.isArray(selectedOption) && (
                  <button
                    type="button"
                    onClick={() => { onChange(selectedOption.value); setIsOpen(false); setSearch(''); }}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-blue-500 bg-blue-50 px-3 text-xs font-bold text-blue-700 dark:border-blue-400 dark:bg-blue-900/25 dark:text-blue-300"
                  >
                    <span className="h-3 w-3 rounded-full border border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400">
                      <span className="block h-full w-full text-center text-[8px] leading-[10px] text-white">✓</span>
                    </span>
                    {selectedOption.label}
                  </button>
                )}
              </div>

              <div className="rounded-md bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Options
              </div>
              <div
                style={{ maxHeight: optionsMaxHeight }}
                className="mt-1 min-h-[72px] overflow-y-auto overscroll-contain px-1 pb-1 pr-2 custom-scrollbar"
              >
                <div className="grid gap-2 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                {filteredOptionsOnly.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-400 italic col-span-full">No matches found</div>
                )}
                {filteredOptionsOnly.map(opt => {
                  const selected = isSelected(opt.value);
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => toggleMultiValue(opt.value)}
                      className={`inline-flex min-h-8 w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/25 dark:text-blue-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full border ${selected ? 'border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400' : 'border-slate-300 dark:border-slate-600'}`}>
                        {selected ? <span className="block h-full w-full text-center text-[8px] leading-[10px] text-white">✓</span> : null}
                      </span>
                      <span className="truncate text-left">{opt.label}</span>
                    </button>
                  );
                })}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: optionsMaxHeight }} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
              <div className="grid gap-2 pt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                {allowEmpty && (
                  <button
                    type="button"
                    onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
                    className={`inline-flex min-h-9 w-full items-center rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                      !value
                        ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-900/20 dark:text-teal-300 font-bold'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700'
                    }`}
                  >
                    {emptyLabel}
                  </button>
                )}
                {filtered.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-slate-400 italic col-span-full">No matches found</div>
                )}
                {filtered.map(opt => {
                  const selected = isSelected(opt.value);
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => toggleMultiValue(opt.value)}
                      className={`inline-flex min-h-9 w-full items-center rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                        selected
                          ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-900/20 dark:text-teal-300 font-bold'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0 w-full">
                        {hasAvatarInOptions && (
                          opt.avatarUrl ? (
                            <img
                              src={opt.avatarUrl}
                              alt={opt.label}
                              className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                            />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center border border-slate-200 dark:border-slate-700">
                              {getInitials(opt.label)}
                            </span>
                          )
                        )}
                        <span className="truncate">{opt.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>,
        portalEl
      )}
    </div>
  );
};
