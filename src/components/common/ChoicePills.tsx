import React from 'react';

export type ChoicePillOption = {
  value: string;
  label: string;
  activeClassName?: string;
  inactiveClassName?: string;
};

interface ChoicePillsProps {
  value: string;
  options: ChoicePillOption[];
  onChange: (value: string) => void;
  className?: string;
  compact?: boolean;
  wrap?: boolean;
}

export const ChoicePills: React.FC<ChoicePillsProps> = ({
  value,
  options,
  onChange,
  className = '',
  compact = false,
  wrap = true,
}) => {
  return (
    <div className={`min-w-0 flex items-center gap-2 ${wrap ? 'flex-wrap' : 'overflow-x-auto whitespace-nowrap'} ${className}`}>
      {options.map((option) => {
        const active = option.value === value;
        const activeClass = option.activeClassName || 'border-blue-500 bg-blue-50 text-blue-700 shadow-[0_0_0_1px_rgba(59,130,246,0.15)] dark:border-blue-400 dark:bg-blue-900/25 dark:text-blue-300';
        const inactiveClass = option.inactiveClassName || 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800';
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-bold leading-none transition-colors ${compact ? 'h-7 px-2 text-[10px]' : 'h-8 px-3 text-xs'} ${active ? activeClass : inactiveClass}`}
          >
            <span className={`h-3 w-3 rounded-full border ${active ? 'border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400' : 'border-slate-300 dark:border-slate-600'}`}>
              {active ? <span className="block h-full w-full text-center text-[8px] leading-[10px] text-white">✓</span> : null}
            </span>
            <span className="whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};
