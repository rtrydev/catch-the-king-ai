import React from 'react';
import { Activity, BarChart3, BrainCircuit, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameMode } from '@/types';

interface HeaderProps {
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;
}

export const Header: React.FC<HeaderProps> = ({ gameMode, setGameMode }) => {
  const getModeLabel = (m: string) => {
    if (m === 'auto') return 'AI Assisted';
    if (m === 'manual') return 'Solver';
    if (m === 'eval') return 'Evaluation';
    return m.charAt(0).toUpperCase() + m.slice(1);
  };

  const getModeDescription = () => {
    if (gameMode === 'eval') return 'Model Performance Analysis';
    if (gameMode === 'auto') return 'Cooperation Mode';
    if (gameMode === 'manual') return 'Manual Solver';
    return '';
  };

  return (
    <header className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 pb-4 border-b border-slate-800/60">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent drop-shadow-sm">
          Catch the King
        </h1>
        <p className="text-slate-400 font-medium text-sm mt-1 flex items-center gap-2">
          {gameMode === 'eval' ? (
            <Activity size={16} className="text-indigo-400" />
          ) : (
            <Zap size={16} className="text-emerald-400" />
          )}
          {getModeDescription()}
        </p>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/50 flex shadow-lg">
        {(['auto', 'manual', 'eval'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setGameMode(m)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer',
              gameMode === m
                ? 'bg-slate-700 text-white shadow-inner'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            )}
          >
            {m === 'eval' && <BarChart3 size={16} />}
            {m === 'manual' && <Target size={16} />}
            {m === 'auto' && <BrainCircuit size={16} />}
            {getModeLabel(m)}
          </button>
        ))}
      </div>
    </header>
  );
};