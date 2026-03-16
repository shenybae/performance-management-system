import React from 'react';
import { motion } from 'motion/react';

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  sublabel?: string;
  className?: string;
}

export const CircularProgress = ({ value, size = 80, strokeWidth = 8, sublabel, className = '' }: CircularProgressProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;

  const color = value >= 100 ? '#10b981' : value >= 50 ? '#0d9488' : value >= 25 ? '#f59e0b' : '#ef4444';

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-black text-slate-800 dark:text-slate-100" style={{ fontSize: size < 60 ? 10 : size < 80 ? 12 : 14 }}>
          {Math.round(value)}%
        </span>
        {sublabel && (
          <span className="text-slate-400 font-bold uppercase" style={{ fontSize: size < 60 ? 7 : 8 }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};
