'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/utils/api';
import { GameStateResponse } from '@/types';
import {
  Crown,
  Skull,
  BrainCircuit,
  RotateCcw,
  Trophy,
  Swords,
  HelpCircle,
  Medal,
  Frown
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import confetti from 'canvas-confetti';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getCardColor = (value: number | null) => {
  if (value === null) return 'bg-slate-800 border-slate-700';
  switch (value) {
    case 1: return 'bg-emerald-900/80 border-emerald-500/50 text-emerald-200';
    case 2: return 'bg-blue-900/80 border-blue-500/50 text-blue-200';
    case 3: return 'bg-indigo-900/80 border-indigo-500/50 text-indigo-200';
    case 4: return 'bg-purple-900/80 border-purple-500/50 text-purple-200';
    case 5: return 'bg-orange-900/80 border-orange-500/50 text-orange-200';
    case 6: return 'bg-yellow-900/80 border-yellow-500/50 text-yellow-200';
    default: return 'bg-slate-800';
  }
};

const formatValue = (val: number | null) => (val === 6 ? 'K' : val);

export default function CatchTheKing() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Visual states
  const [tempRevealed, setTempRevealed] = useState<{r: number, c: number, val: number} | null>(null);
  const [trapHintCells, setTrapHintCells] = useState<number[][]>([]);
  const [aiHintCell, setAiHintCell] = useState<{r: number, c: number} | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  // Timer refs for cleanup
  const tempRevealedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const trapHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startNewGame();
  }, []);

  const startNewGame = async () => {
    setLoading(true);
    setAutoMode(false);
    try {
      const { session_id } = await api.createGame();
      setSessionId(session_id);
      const state = await api.getState(session_id);
      setGameState(state);
      setTempRevealed(null);
      setTrapHintCells([]);
      setAiHintCell(null);
    } catch (e) {
      console.error("Failed to start game", e);
    } finally {
      setLoading(false);
    }
  };

  const handleMove = useCallback(async (row: number, col: number) => {
    if (!sessionId || !gameState || gameState.game_over) return;

    // Optimistic validity check
    const isValid = gameState.valid_moves.some(([r, c]) => r === row && c === col);
    if (!isValid) return;

    // Clear previous timers and visual states
    if (tempRevealedTimerRef.current) {
      clearTimeout(tempRevealedTimerRef.current);
      tempRevealedTimerRef.current = null;
    }
    if (trapHintTimerRef.current) {
      clearTimeout(trapHintTimerRef.current);
      trapHintTimerRef.current = null;
    }
    setTempRevealed(null);
    setTrapHintCells([]);
    setAiHintCell(null);

    try {
      const res = await api.makeMove(sessionId, row, col);

      // Force a fresh state fetch (now with no-store cache)
      const newState = await api.getState(sessionId);

      if (res.re_hidden) {
        // Show the value briefly even though it is about to be hidden
        // We look up the value from the newState where 'known' might be true
        // Or we fallback to the known logic.
        const val = newState.grid[row][col].value;
        if (val !== null) {
          setTempRevealed({ r: row, c: col, val });
          tempRevealedTimerRef.current = setTimeout(() => {
            setTempRevealed(null);
            tempRevealedTimerRef.current = null;
          }, 1500);
        }
      }

      if (res.show_hint) {
        const neighbors = [];
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            if (i===0 && j===0) continue;
            const nr = row + i, nc = col + j;
            if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
              neighbors.push([nr, nc]);
            }
          }
        }
        setTrapHintCells(neighbors);
        trapHintTimerRef.current = setTimeout(() => {
          setTrapHintCells([]);
          trapHintTimerRef.current = null;
        }, 1500);
      }

      if (res.game_over && res.score >= 400) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }

      setGameState(newState);

    } catch (e) {
      console.error("Move failed", e);
    }
  }, [sessionId, gameState]);

  // Auto mode: automatically play AI hints with 1s delay
  useEffect(() => {
    if (!autoMode || !sessionId || !gameState || gameState.game_over || aiLoading) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const hint = await api.getHint(sessionId);
        const [r, c] = hint.recommended_move;
        setAiHintCell({ r, c });

        // Small delay to show the hint before making the move
        setTimeout(() => {
          handleMove(r, c);
        }, 200);
      } catch (e) {
        console.error("Auto mode: AI hint failed", e);
        setAutoMode(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [autoMode, sessionId, gameState, aiLoading, handleMove]);

  const handleAskAI = async () => {
    if (!sessionId || !gameState || gameState.game_over || aiLoading) return;
    setAiLoading(true);
    try {
      const hint = await api.getHint(sessionId);
      const [r, c] = hint.recommended_move;
      setAiHintCell({ r, c });
    } catch (e) {
      console.error("AI hint failed", e);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading || !gameState) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-600 border-t-emerald-500 rounded-full animate-spin"></div>
          <p>Loading Game...</p>
        </div>
      </div>
    );
  }

  const isSilver = gameState.score >= 400;
  const isGold = gameState.score >= 550;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      <div className="max-w-6xl mx-auto p-4 md:p-8 grid md:grid-cols-[1fr_320px] gap-8 h-full">

        {/* Left: Board */}
        <div className="flex flex-col gap-6 justify-center">
          <header className="flex justify-between items-center mb-2">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Catch the King
              </h1>
              <p className="text-slate-500 text-sm mt-1">Reveal cards, avoid 5s, find the King.</p>
            </div>
          </header>

          <div className="relative w-full max-w-[600px] mx-auto bg-slate-900/50 p-4 rounded-xl border border-slate-800 shadow-2xl">
            <div className="grid grid-cols-5 gap-3 w-full">
              {gameState.grid.map((row, rIndex) =>
                row.map((cell, cIndex) => {

                  const isTempRevealed = tempRevealed?.r === rIndex && tempRevealed?.c === cIndex;
                  const isTrapHint = trapHintCells.some(([tr, tc]) => tr === rIndex && tc === cIndex);
                  const isAiHint = aiHintCell?.r === rIndex && aiHintCell?.c === cIndex;

                  // Reveal logic: Standard Reveal OR Temp Reveal OR Game Over Passive Reveal
                  const isPassiveReveal = gameState.game_over && !cell.revealed && cell.value !== null;
                  const isVisible = cell.revealed || isTempRevealed || isPassiveReveal;
                  const displayValue = isVisible
                    ? (cell.revealed || isPassiveReveal ? cell.value : tempRevealed?.val)
                    : null;

                  const isValidMove = gameState.valid_moves.some(([r, c]) => r === rIndex && c === cIndex);

                  // Should we show disabled state?
                  // Disabled if: (Not Valid AND Game Not Over) OR (Not Valid AND Not Visible)
                  // Note: Valid moves on hidden cards should NOT look disabled.
                  const isDisabled = !isValidMove || gameState.game_over;

                  return (
                    <button
                      key={`${rIndex}-${cIndex}`}
                      onClick={() => handleMove(rIndex, cIndex)}
                      disabled={isDisabled}
                      className={cn(
                        "relative w-full aspect-square flex items-center justify-center text-xl sm:text-3xl font-bold rounded-lg transition-all duration-300",
                        "shadow-lg",
                        getCardColor(isVisible ? displayValue : null),

                        // Passive Reveal (Game Over)
                        isPassiveReveal && "opacity-40 grayscale saturate-0 border-dashed border-2 scale-95",

                        // Playable (Hidden)
                        !isVisible && isValidMove && !gameState.game_over && "hover:scale-105 hover:bg-slate-700 cursor-pointer hover:border-emerald-500/30 shadow-black/50",

                        // Truly Disabled (Invalid Move)
                        isDisabled && !isVisible && "opacity-60 cursor-not-allowed",

                        // AI Hint
                        isAiHint && !isVisible && "animate-pulse ring-4 ring-cyan-500/50 z-10 scale-105",

                        // Completion highlight
                        (gameState.rows_completed[rIndex] || gameState.cols_completed[cIndex]) && isVisible && !isPassiveReveal && "brightness-125 ring-2 ring-yellow-500/20"
                      )}
                    >
                      {isVisible ? (
                        <span className={cn(
                          "drop-shadow-md transform transition-all duration-500",
                          displayValue === 6 ? "scale-125 text-yellow-400" : ""
                        )}>
                          {displayValue === 6 ? <Crown size={32} fill="currentColor" /> : displayValue}
                        </span>
                      ) : (
                        <div className="w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-500 to-transparent rounded-lg" />
                      )}

                      {isTrapHint && !isVisible && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg animate-in fade-in duration-300 z-20">
                          <Skull className="text-red-500 animate-bounce" size={28} />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="flex flex-col gap-6">

          {gameState.game_over && (
            <div className="bg-slate-900 border-2 border-slate-700 p-6 rounded-2xl shadow-2xl animate-in slide-in-from-right-10 fade-in duration-500">
               <div className="flex items-center gap-3 mb-4 border-b border-slate-800 pb-4">
                 {isGold ? (
                   <div className="p-3 bg-yellow-500/20 rounded-full text-yellow-400"><Trophy size={24} /></div>
                 ) : isSilver ? (
                   <div className="p-3 bg-slate-400/20 rounded-full text-slate-300"><Medal size={24} /></div>
                 ) : (
                   <div className="p-3 bg-red-500/20 rounded-full text-red-400"><Frown size={24} /></div>
                 )}
                 <div>
                   <h2 className="text-xl font-bold text-white">
                     {isGold ? "Gold Medal!" : isSilver ? "Silver Medal" : "Game Over"}
                   </h2>
                   <p className="text-slate-400 text-xs uppercase tracking-wider">Final Result</p>
                 </div>
               </div>

               <div className="flex justify-between items-center mb-6">
                 <span className="text-slate-400">Final Score</span>
                 <span className={cn("text-3xl font-bold", isGold ? "text-yellow-400" : isSilver ? "text-slate-200" : "text-slate-500")}>
                   {gameState.score}
                 </span>
               </div>

               <button
                  onClick={startNewGame}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-transform hover:scale-105 shadow-lg shadow-emerald-900/20"
                >
                  <RotateCcw size={20} /> Play Again
                </button>
            </div>
          )}

          {!gameState.game_over && (
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden">
               <div className="absolute bottom-0 left-0 h-1 bg-slate-800 w-full">
                 <div
                   className="h-full bg-gradient-to-r from-emerald-600 to-yellow-500 transition-all duration-1000"
                   style={{ width: `${Math.min(100, (gameState.score / 600) * 100)}%` }}
                  />
               </div>

               <div className="flex justify-between items-end mb-2">
                  <span className="text-slate-400 font-medium text-sm uppercase tracking-wider">Score</span>
                  <span className="text-4xl font-bold text-white">{gameState.score}</span>
               </div>

               <div className="flex gap-2 text-xs font-semibold mt-4">
                 <div className={cn("flex-1 py-2 px-3 rounded bg-slate-800 flex items-center justify-center gap-2", isSilver && "bg-slate-200 text-slate-900")}>
                   <Trophy size={14} /> 400
                 </div>
                 <div className={cn("flex-1 py-2 px-3 rounded bg-slate-800 flex items-center justify-center gap-2", isGold && "bg-yellow-400 text-yellow-900")}>
                   <Trophy size={14} /> 550
                 </div>
               </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
            <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
              <Swords size={16} /> Hand
            </h3>

            <div className="flex items-center gap-4">
              <div className="relative group">
                {gameState.current_card ? (
                  <div className={cn(
                    "w-20 h-24 sm:w-20 sm:h-28 rounded-xl flex items-center justify-center text-3xl font-bold shadow-2xl border-t border-white/10 ring-4 ring-black/50 transition-transform",
                    getCardColor(gameState.current_card),
                    gameState.game_over && "opacity-50 grayscale"
                  )}>
                    {formatValue(gameState.current_card)}
                  </div>
                ) : (
                   <div className="w-20 h-24 sm:h-28 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center">
                     <span className="text-slate-600 text-xs">Empty</span>
                   </div>
                )}
                <div className="absolute -bottom-6 left-0 right-0 text-center text-xs text-slate-500">Current</div>
              </div>

              <div className="flex-1 flex items-center justify-center relative h-28">
                {gameState.hand.slice(1).slice(0, 5).map((card, idx) => (
                   <div
                      key={idx}
                      className="absolute w-16 h-24 rounded-lg border border-slate-700 shadow-md flex items-center justify-center text-xl font-bold text-slate-400 bg-slate-800"
                      style={{
                        left: `${idx * 15}px`,
                        zIndex: 5 - idx,
                        transform: `scale(${1 - idx * 0.05})`
                      }}
                   >
                     {idx < 2 ? formatValue(card) : ''}
                   </div>
                ))}
              </div>
            </div>
          </div>

          {!gameState.game_over && (
            <div className="grid gap-3">
              <button
                onClick={handleAskAI}
                disabled={aiLoading || autoMode}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white p-4 rounded-xl font-semibold shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-3 transition-all hover:-translate-y-1 active:translate-y-0"
              >
                {aiLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <BrainCircuit size={20} />
                )}
                Ask AI Hint
              </button>

              <button
                onClick={() => setAutoMode(!autoMode)}
                className={cn(
                  "p-4 rounded-xl font-semibold shadow-lg flex items-center justify-center gap-3 transition-all hover:-translate-y-1 active:translate-y-0",
                  autoMode
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20"
                    : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/20"
                )}
              >
                {autoMode ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Auto Mode Running...
                  </>
                ) : (
                  <>
                    <BrainCircuit size={20} />
                    Start Auto Mode
                  </>
                )}
              </button>

              <button
                onClick={startNewGame}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-4 rounded-xl font-semibold border border-slate-700 flex items-center justify-center gap-3 transition-colors"
              >
                <RotateCcw size={18} /> Restart
              </button>
            </div>
          )}

          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
            <div className="flex items-start gap-2">
              <HelpCircle size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <p>Card &gt; Board ? Score & Keep.</p>
            </div>
            <div className="flex items-start gap-2">
              <Skull size={14} className="mt-0.5 shrink-0 text-red-900" />
              <p>Trap: 5 captures your 5.</p>
            </div>
            <div className="flex items-start gap-2">
              <Crown size={14} className="mt-0.5 shrink-0 text-yellow-700" />
              <p>King captures King (100pts).</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}