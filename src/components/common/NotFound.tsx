import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Home } from 'lucide-react';

interface NotFoundProps {
  onGoHome: () => void;
}

export const NotFound = ({ onGoHome }: NotFoundProps) => {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#070d14] overflow-hidden">
      {/* Subtle radial glow behind content */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full bg-teal-500/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center text-center px-6"
      >
        {/* Logo */}
        <motion.img
          src="/logo.png"
          alt="Maptech Logo"
          className="h-14 object-contain mb-10 opacity-70"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 0.7, scale: 1 }}
          transition={{ delay: 0.1 }}
        />

        {/* 404 */}
        <motion.h1
          className="text-[10rem] leading-none font-black text-teal-400 select-none"
          style={{ textShadow: '0 0 60px rgba(52,211,153,0.25)' }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 120 }}
        >
          404
        </motion.h1>

        {/* Heading */}
        <motion.p
          className="text-2xl font-bold text-white mt-2 mb-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          Page Not Found
        </motion.p>

        {/* Subtitle */}
        <motion.p
          className="text-sm text-slate-400 max-w-sm mb-10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          The page you're looking for doesn't exist or has been moved.
        </motion.p>

        {/* Buttons */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
        >
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold transition-colors border border-slate-700"
          >
            <ArrowLeft size={15} /> Go Back
          </button>
          <button
            onClick={onGoHome}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-sm font-bold transition-colors shadow-lg shadow-teal-500/20"
          >
            <Home size={15} /> Go Home
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default NotFound;
