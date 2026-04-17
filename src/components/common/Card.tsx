import React from 'react';
import { motion } from 'motion/react';

export const Card = ({ children, className = "", ...props }: { children: React.ReactNode, className?: string, [key: string]: any }) => (
  <motion.div 
    whileHover={{ y: -2 }}
    className={`glass-card p-7 ${className}`} 
    {...props}
  >
    {children}
  </motion.div>
);
