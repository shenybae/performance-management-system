import React from 'react';
import { motion } from 'motion/react';
import { Award } from 'lucide-react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

export const Promotability = () => {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <SectionHeader title="Promotability & Recommendation" subtitle="Recommend tenure, promotion, or discontinuation" />
      <Card className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
        <Award size={48} className="mb-4 opacity-20 text-teal-green" />
        <p className="text-sm font-bold uppercase tracking-widest">Promotability recommendation module coming soon.</p>
      </Card>
    </motion.div>
  );
};
