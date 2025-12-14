import React from 'react';
import { BrainCircuit, Frown, Medal, RotateCcw, Swords, Trophy, Zap, BookOpen } from 'lucide-react';
import { cn, getCardColor, formatValue } from '@/lib/utils';
import { GameStateResponse, GameMode } from '@/types';
import { SCORE_GOLD, SCORE_SILVER } from '@/lib/constants';

interface Props {
  gameState: GameStateResponse;
  gameMode: GameMode;
  aiLoading: boolean;
  autoPlayActive: boolean;
  onRestart: () => void;
  onAskAI: () => void;
  onToggleAutoPlay: () => void;
  onShowRules: () => void;
}

export const GameSidebar: React.FC<Props> = ({
  gameState,
  gameMode,
  aiLoading,
  autoPlayActive,
  onRestart,
  onAskAI,
  onToggleAutoPlay,
  onShowRules
}) => {
  const isSilver = gameState.score >= SCORE_SILVER;
  const isGold = gameState.score >= SCORE_GOLD;

  // Define max score for the bar scale
  const MAX_SCORE = 600;
  const scorePercent = Math.min(100, (gameState.score / MAX_SCORE) * 100);
  const silverPercent = (SCORE_SILVER / MAX_SCORE) * 100;
  const goldPercent = (SCORE_GOLD / MAX_SCORE) * 100;

  return (
    <div className="flex flex-col gap-4 md:gap-6 animate-in slide-in-from-right-8 duration-500">

      {/*
        Layout Container:
        - Grid 2-cols on Mobile (Score left, Hand right)
        - Flex Col on Desktop (Stacked)
      */}
      <div className="grid grid-cols-2 md:flex md:flex-col gap-3 md:gap-6">

        {/* Score Card */}
        {/* Using justify-between ensures the 'Score' label stays at the top (aligning with Hand label)
            while the content fills the rest or sits at the bottom */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-4 md:p-6 rounded-2xl shadow-xl relative overflow-hidden group col-span-1 flex flex-col justify-between">
          {gameState.game_over && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 text-center animate-in fade-in">
              {isGold ? (
                <Trophy className="text-yellow-400 mb-1 animate-bounce w-8 h-8 md:w-12 md:h-12" />
              ) : isSilver ? (
                <Medal className="text-slate-300 mb-1 w-8 h-8 md:w-12 md:h-12" />
              ) : (
                <Frown className="text-slate-500 mb-1 w-8 h-8 md:w-12 md:h-12" />
              )}
              <h2 className="text-lg md:text-2xl font-bold text-white mb-0 md:mb-1 leading-tight">
                {isGold ? 'Legendary!' : isSilver ? 'Well Done' : 'Game Over'}
              </h2>
              <span className="text-slate-400 text-xs md:text-sm mb-2 md:mb-3 sm:block">Final: {gameState.score}</span>
              <button
                onClick={onRestart}
                className="bg-emerald-600 hover:bg-emerald-500 mb-1 text-white px-6 py-2 text text-sm md:text-base rounded-full font-bold shadow-lg transition-transform hover:scale-105 cursor-pointer"
              >
                Replay
              </button>
            </div>
          )}

          {/* Header Row */}
          <div className="flex justify-between items-end mb-0 md:mb-4 relative z-0">
            <span className="text-slate-400 text-[10px] md:text-xs uppercase font-bold tracking-wider mb-2 md:mb-0">Score</span>
            {/* Desktop View: Score is at top right */}
            <span className="hidden md:block text-5xl font-black text-white tracking-tighter leading-none">{gameState.score}</span>
          </div>

          {/* Bottom Content Wrapper */}
          <div className="relative w-full z-0 mb-1">

            {/* Mobile View: Score is just above the bar */}
            <div className="block md:hidden mb-3">
               <span className="text-4xl font-black text-white tracking-tighter leading-none">{gameState.score}</span>
            </div>

            {/* Progress Bar Track */}
            <div className="w-full h-2 md:h-3 bg-slate-800 rounded-full overflow-hidden relative">
              {/* Fill */}
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-yellow-500 transition-all duration-700 ease-out"
                style={{ width: `${scorePercent}%` }}
              />

              {/* Tick Marks */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-slate-950/30 border-r border-white/10"
                style={{ left: `${silverPercent}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-slate-950/30 border-r border-white/10"
                style={{ left: `${goldPercent}%` }}
              />
            </div>

            {/* Labels */}
            <div className="relative w-full h-4 mt-1 text-[10px] font-bold text-slate-500 uppercase">
              <span className="absolute left-0 transform -translate-x-0">0</span>
              <span
                className={cn(
                  "absolute transform -translate-x-1/2 transition-colors duration-300",
                  isSilver ? 'text-emerald-400' : ''
                )}
                style={{ left: `${silverPercent}%` }}
              >
                {SCORE_SILVER}
              </span>
              <span
                className={cn(
                  "absolute transform -translate-x-1/2 transition-colors duration-300",
                  isGold ? 'text-yellow-400' : ''
                )}
                style={{ left: `${goldPercent}%` }}
              >
                {SCORE_GOLD}
              </span>
            </div>
          </div>
        </div>

        {/* Hand Card */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-4 md:p-6 rounded-2xl shadow-xl col-span-1 flex flex-col justify-between md:block">
          {/* Header aligns with Score label via justify-between on mobile */}
          <h3 className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-2 md:mb-4 flex items-center gap-2">
            <Swords size={14} /> <span className="hidden md:inline">Current</span> Hand
          </h3>

          <div className="flex items-center justify-center md:justify-start gap-4">
            {/* Active Card Container */}
            <div className="relative">
              {gameState.current_card ? (
                <div
                  className={cn(
                    // Responsive sizing: Smaller on mobile, Larger on desktop
                    'w-14 h-20 md:w-16 md:h-24 rounded-xl flex items-center justify-center text-xl md:text-2xl font-bold shadow-2xl border-t border-white/20 transition-transform transform hover:-translate-y-2',
                    getCardColor(gameState.current_card)
                  )}
                >
                  {formatValue(gameState.current_card)}
                </div>
              ) : (
                <div className="w-14 h-20 md:w-16 md:h-24 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-[10px] md:text-xs">
                  Empty
                </div>
              )}
              <div className="text-center text-[10px] text-slate-500 mt-1 md:mt-2 uppercase font-bold">Active</div>
            </div>

            {/* Upcoming Stack - Hidden on Mobile */}
            <div className="hidden md:flex flex-1 h-24 relative items-center pl-2">
              {gameState.hand.slice(1, 6).map((c, i) => (
                <div
                  key={i}
                  className="absolute w-14 h-20 rounded-lg bg-slate-800 border border-slate-600 shadow-md flex items-center justify-center text-lg font-bold text-slate-400 transition-all hover:translate-y-[-5px]"
                  style={{ left: i * 25, zIndex: 10 - i }}
                >
                  {i < 2 ? formatValue(c) : ''}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Controls */}
      {!gameState.game_over && (
        <div className="flex flex-col gap-3">
          {gameMode !== 'manual' && (
            <button
              onClick={onAskAI}
              disabled={aiLoading || autoPlayActive}
              className="group bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-200 p-3 md:p-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
            >
              {aiLoading ? (
                <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
              ) : (
                <BrainCircuit size={18} className="group-hover:scale-110 transition-transform" />
              )}
              Ask AI
            </button>
          )}
          {gameMode !== 'manual' && (
            <button
              onClick={onToggleAutoPlay}
              className={cn(
                'p-3 md:p-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3 shadow-lg border cursor-pointer',
                autoPlayActive
                  ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-300 animate-pulse'
                  : 'bg-cyan-600 hover:bg-cyan-500 border-transparent text-white'
              )}
            >
              <Zap size={18} className={cn(autoPlayActive && 'animate-bounce')} />
              {autoPlayActive ? 'Autopilot On' : 'Start Autopilot'}
            </button>
          )}
          {gameMode === 'auto' && (
            <button
              onClick={onShowRules}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-3 md:p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-700"
            >
              <BookOpen size={16} /> Rules
            </button>
          )}
          <button
            onClick={onRestart}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-3 md:p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw size={16} /> Restart
          </button>
        </div>
      )}
    </div>
  );
};