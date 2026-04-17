import React from 'react';
import { motion } from 'motion/react';

export const SectionHeader = ({ title, subtitle }: { title: string, subtitle?: string }) => (
  <motion.div 
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    className="mb-8"
  >
    <h2 className="text-3xl sm:text-[2rem] font-bold text-teal-deep dark:text-teal-green tracking-tight">{title}</h2>
    {subtitle && <p className="text-slate-500 dark:text-slate-300 text-sm sm:text-base mt-1.5">{subtitle}</p>}
  </motion.div>
);
