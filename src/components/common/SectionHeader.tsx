import React from 'react';
import { motion } from 'motion/react';

export const SectionHeader = ({ title, subtitle }: { title: string, subtitle?: string }) => (
  <motion.div 
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    className="mb-6"
  >
    <h2 className="text-2xl font-bold text-teal-deep dark:text-teal-green tracking-tight">{title}</h2>
    {subtitle && <p className="text-slate-500 dark:text-slate-300 text-sm mt-1">{subtitle}</p>}
  </motion.div>
);
