import React from 'react';
import { motion } from 'motion/react';

export const SidebarItem = ({ icon: Icon, label, active, onClick, expanded = true }: { icon: any, label: string, active: boolean, onClick: () => void, expanded?: boolean }) => (
  <motion.button
    whileHover={{ backgroundColor: 'rgba(148,163,184,0.08)' }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    title={!expanded ? label : undefined}
    className={`w-full flex items-center py-3.5 text-base font-bold transition-colors duration-200 ${
      expanded ? 'justify-start px-4' : 'justify-center px-0'
    } ${
      active 
        ? 'bg-teal-green/10 text-teal-deep dark:text-teal-green border-r-4 border-teal-green shadow-sm' 
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200'
    }`}
  >
    <span className={`inline-flex shrink-0 items-center justify-center ${expanded ? 'w-5' : 'w-full'}`}>
      <Icon size={18} className={active ? 'text-teal-green' : ''} />
    </span>
    <motion.span
      initial={false}
      animate={{
        opacity: expanded ? 1 : 0,
        maxWidth: expanded ? 180 : 0,
        x: expanded ? 0 : -4,
      }}
      transition={{
        opacity: { duration: expanded ? 0.16 : 0.1, ease: 'easeOut', delay: expanded ? 0.02 : 0 },
        maxWidth: { duration: expanded ? 0.22 : 0.14, ease: [0.22, 1, 0.36, 1] },
        x: { duration: expanded ? 0.16 : 0.1, ease: 'easeOut' },
      }}
      className="ml-2 text-base font-bold whitespace-nowrap overflow-hidden"
    >
      {label}
    </motion.span>
  </motion.button>
);
