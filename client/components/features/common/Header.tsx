import React from 'react';
import { Activity, BarChart3, BrainCircuit, Target, Zap, Crown } from 'lucide-react';
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
    if (gameMode === 'auto') return 'Assisted Mode'; // Changed from 'Cooperation Mode'
    if (gameMode === 'manual') return 'Manual Solver';
    return '';
  };

  return (
    <header className="flex flex-col md:flex-row justify-between items-center gap-4 pb-4 border-b border-slate-800/60">
      <div className="text-center md:text-left">
        {/* Updated Title Section: "Catch the" (White) + "King" (Gold) */}
        <h1 className="relative text-4xl md:text-5xl font-black uppercase tracking-wide flex items-center justify-center md:justify-start gap-3">
          <span className="text-slate-100 drop-shadow-lg">
            Catch the
          </span>
          <span className="bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(234,179,8,0.3)]">
            King
          </span>
          <Crown
            className="text-yellow-400 hidden sm:block"
            size={36}
            strokeWidth={2.5}
            fill="rgba(250, 204, 21, 0.2)"
          />
        </h1>

        <p className="text-slate-400 font-medium text-sm mt-2 flex items-center justify-center md:justify-start gap-2">
          {gameMode === 'eval' ? (
            <Activity size={16} className="text-indigo-400" />
          ) : (
            <Zap size={16} className="text-yellow-400" />
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
              'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer',
              gameMode === m
                ? 'bg-slate-700 text-white shadow-inner border border-slate-600'
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