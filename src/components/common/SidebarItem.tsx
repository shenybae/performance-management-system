import React from 'react';
import { motion } from 'motion/react';

export const SidebarItem = ({ icon: Icon, label, active, onClick, expanded = true }: { icon: any, label: string, active: boolean, onClick: () => void, expanded?: boolean }) => (
  <motion.button
    whileHover={{ x: 4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    title={!expanded ? label : undefined}
    className={`w-full flex items-center py-3 text-sm font-bold transition-all duration-200 ${
      expanded ? 'justify-start px-4' : 'justify-center px-2'
    } ${
      active 
        ? 'bg-teal-green/10 text-teal-deep dark:text-teal-green border-r-4 border-teal-green shadow-sm' 
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200'
    }`}
  >
    <span className="inline-flex w-5 shrink-0 items-center justify-center">
      <Icon size={18} className={active ? 'text-teal-green' : ''} />
    </span>
    <motion.span
      initial={false}
      animate={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="ml-2 text-sm font-bold whitespace-nowrap overflow-hidden"
    >
      {label}
    </motion.span>
  </motion.button>
);
