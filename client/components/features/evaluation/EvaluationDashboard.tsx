import React from 'react';
import { Activity, Play, Square, TrendingDown, TrendingUp, Medal, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SCORE_GOLD, SCORE_SILVER } from '@/lib/constants';
import { EvaluationChart } from './EvaluationChart';

interface Props {
  scores: number[];
  target: number;
  setTarget: (n: number) => void;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
}

export const EvaluationDashboard: React.FC<Props> = ({ scores, target, setTarget, isRunning, onRun, onStop }) => {
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const minScore = scores.length ? Math.min(...scores) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const silverCount = scores.filter((s) => s >= SCORE_SILVER).length;
  const goldCount = scores.filter((s) => s >= SCORE_GOLD).length;
  const silverPct = scores.length ? ((silverCount / scores.length) * 100).toFixed(1) : '0.0';
  const goldPct = scores.length ? ((goldCount / scores.length) * 100).toFixed(1) : '0.0';

  return (
    <div key="eval-ui" className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
      {/* 1. Control Deck */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-4 sm:p-6 rounded-2xl shadow-2xl flex flex-col sm:flex-row flex-wrap items-center justify-center sm:justify-between gap-4 sm:gap-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Simulations</label>
            <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 px-3">
              <input
                type="number"
                min="1"
                max="2000"
                value={target}
                onChange={(e) => setTarget(Math.max(1, parseInt(e.target.value) || 0))}
                disabled={isRunning}
                className="bg-transparent text-white font-mono py-2 w-20 focus:outline-none"
              />
              <span className="text-slate-500 text-sm">runs</span>
            </div>
          </div>

          <button
            onClick={isRunning ? onStop : onRun}
            className={cn(
              'flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 cursor-pointer',
              isRunning ? 'bg-red-500/80 hover:bg-red-500 shadow-red-900/30' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/30'
            )}
          >
            {isRunning ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            {isRunning ? 'Stop' : 'Run Model'}
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-4">
          <div className="text-center sm:text-right">
            <div className="text-xs text-slate-400 uppercase font-bold">Games Played</div>
            <div className="text-2xl font-mono text-white">
              {scores.length} <span className="text-slate-500">/ {target}</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-full border-4 border-slate-700 flex items-center justify-center relative">
            <div
              className="absolute inset-0 rounded-full border-4 border-indigo-500 transition-all duration-300"
              style={{ clipPath: `inset(0 0 ${(1 - scores.length / target) * 100}% 0)` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard icon={TrendingDown} color="text-pink-400" label="Min Score" value={minScore} valColor="text-pink-100" />
        <MetricCard icon={Activity} color="text-indigo-400" label="Avg Score" value={avgScore} valColor="text-white" />
        <MetricCard icon={TrendingUp} color="text-cyan-400" label="Max Score" value={maxScore} valColor="text-cyan-100" />
        <MetricCard icon={Medal} color="text-slate-300" label="Silver Rate" value={`${silverPct}%`} valColor="text-slate-200" />
        <MetricCard icon={Trophy} color="text-yellow-400" label="Gold Rate" value={`${goldPct}%`} valColor="text-yellow-400" />
      </div>

      {/* 3. Dual Visualization Canvas */}
      <EvaluationChart scores={scores} isActive={true} />
    </div>
  );
};

const MetricCard = ({ icon: Icon, color, label, value, valColor }: any) => (
  <div className="bg-slate-900/40 backdrop-blur border border-slate-700/50 p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center gap-1 text-center group hover:bg-slate-900/60 transition-colors">
    <Icon size={20} className={`${color} mb-1`} />
    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">{label}</div>
    <div className={`text-2xl font-bold tracking-tight ${valColor}`}>{value}</div>
  </div>
);