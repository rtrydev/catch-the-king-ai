import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getCardColor = (value: number | null) => {
  if (value === null) return 'bg-slate-800/80 border-slate-700/50';
  switch (value) {
    case 1: return 'bg-emerald-900/90 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]';
    case 2: return 'bg-blue-900/90 border-blue-500/50 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.2)]';
    case 3: return 'bg-indigo-900/90 border-indigo-500/50 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]';
    case 4: return 'bg-purple-900/90 border-purple-500/50 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]';
    case 5: return 'bg-orange-900/90 border-orange-500/50 text-orange-300 shadow-[0_0_15px_rgba(249,115,22,0.2)]';
    case 6: return 'bg-yellow-900/90 border-yellow-500/50 text-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.2)]';
    default: return 'bg-slate-800/80';
  }
};

export const formatValue = (val: number | null) => (val === 6 ? 'K' : val);