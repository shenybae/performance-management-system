import React from 'react';
import { motion } from 'motion/react';

export const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <motion.button
    whileHover={{ x: 4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-all duration-200 ${
      active 
        ? 'bg-teal-green/10 text-teal-deep dark:text-teal-green border-r-4 border-teal-green shadow-sm' 
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200'
    }`}
  >
    <Icon size={18} className={active ? 'text-teal-green' : ''} />
    {label}
  </motion.button>
);
