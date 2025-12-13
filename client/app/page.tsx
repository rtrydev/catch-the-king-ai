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
  Frown,
  Check,
  Target
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
  const [isManualMode, setIsManualMode] = useState(false);

  // Visual states
  const [tempRevealed, setTempRevealed] = useState<{r: number, c: number, val: number} | null>(null);
  const [trapHintCells, setTrapHintCells] = useState<number[][]>([]);
  const [aiHintCell, setAiHintCell] = useState<{r: number, c: number} | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  // Manual Mode State (Inline Panel)
  const [selectedCell, setSelectedCell] = useState<{r: number, c: number} | null>(null);
  const [inputVal, setInputVal] = useState<number | null>(null);
  const [inputHint, setInputHint] = useState(false);

  // Timer refs
  const tempRevealedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const trapHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startNewGame(false);
  }, []);

  const startNewGame = async (manual: boolean) => {
    setLoading(true);
    setAutoMode(false);
    setIsManualMode(manual);
    try {
      const { session_id } = await api.createGame(manual);
      setSessionId(session_id);
      const state = await api.getState(session_id);
      setGameState(state);
      setTempRevealed(null);
      setTrapHintCells([]);
      setAiHintCell(null);

      // Reset inputs
      setInputVal(null);
      setInputHint(false);

      if (manual) {
        // AUTOMATION: Immediately get the first hint and select it
        try {
          const hint = await api.getHint(session_id);
          const [r, c] = hint.recommended_move;
          setAiHintCell({ r, c });
          setSelectedCell({ r, c });
        } catch (err) {
          console.error("Failed to get initial hint", err);
        }
      } else {
        setSelectedCell(null);
      }

    } catch (e) {
      console.error("Failed to start game", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTileClick = (row: number, col: number) => {
    if (!sessionId || !gameState || gameState.game_over) return;

    // In Manual Mode: STRICTLY DISALLOW user selection changes.
    // The selection is driven purely by the AI flow.
    if (gameState.is_manual) {
      return;
    } else {
      // Auto Mode: Execute immediately
      handleAutoMove(row, col);
    }
  };

  const handleManualSubmit = async () => {
    if (!selectedCell || !sessionId || inputVal === null) return;

    const targetR = selectedCell.r;
    const targetC = selectedCell.c;
    const val = inputVal;
    const hint = inputHint;

    // Visual feedback that something is processing
    setAiLoading(true);

    try {
      const res = await api.makeManualMove(sessionId, targetR, targetC, val, hint);
      await processMoveResult(res, targetR, targetC, val);

      // AUTOMATION: If game isn't over, immediately select next field via AI
      if (!res.game_over) {
        const nextHint = await api.getHint(sessionId);
        const [r, c] = nextHint.recommended_move;

        // Update UI for the next move
        setAiHintCell({ r, c });
        setSelectedCell({ r, c });
        setInputVal(null);
        setInputHint(false);
      } else {
        // Game Over: Clear selection
        setSelectedCell(null);
        setAiHintCell(null);
      }
    } catch (e) {
      console.error("Manual move failed", e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAutoMove = async (row: number, col: number) => {
    if (!sessionId) return;
    setAiHintCell(null);

    try {
      const res = await api.makeMove(sessionId, row, col);
      // Fetch fresh state to know the value if needed
      const newState = await api.getState(sessionId);
      const val = newState.grid[row][col].value;
      processMoveResult(res, row, col, val, newState);
    } catch (e) {
      console.error("Auto move failed", e);
    }
  };

  const processMoveResult = async (
    res: any,
    row: number,
    col: number,
    knownValue: number | null,
    providedState?: GameStateResponse
  ) => {
    if (!sessionId) return;

    // Use provided state or fetch fresh
    const newState = providedState || await api.getState(sessionId);

    // Visual flare for hints
    if (res.re_hidden && knownValue !== null) {
      setTempRevealed({ r: row, c: col, val: knownValue });
      if (tempRevealedTimerRef.current) clearTimeout(tempRevealedTimerRef.current);
      tempRevealedTimerRef.current = setTimeout(() => {
        setTempRevealed(null);
        tempRevealedTimerRef.current = null;
      }, 1500);
    }

    if (res.show_hint) {
      const neighbors = [];
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i===0 && j===0) continue;
          const nr = row + i, nc = col + j;
          if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) neighbors.push([nr, nc]);
        }
      }
      setTrapHintCells(neighbors);
      if (trapHintTimerRef.current) clearTimeout(trapHintTimerRef.current);
      trapHintTimerRef.current = setTimeout(() => {
        setTrapHintCells([]);
        trapHintTimerRef.current = null;
      }, 1500);
    }

    if (res.game_over && res.score >= 400) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }

    setGameState(newState);
  };

  const handleAskAI = async () => {
    if (!sessionId || !gameState || gameState.game_over || aiLoading) return;
    setAiLoading(true);
    try {
      const hint = await api.getHint(sessionId);
      const [r, c] = hint.recommended_move;
      setAiHintCell({ r, c });

      // Automatically select the AI recommended cell in manual mode
      if (isManualMode) {
        setSelectedCell({ r, c });
        setInputVal(null);
        setInputHint(false);
      }
    } catch (e) {
      console.error("AI hint failed", e);
    } finally {
      setAiLoading(false);
    }
  };

  // Auto-play logic (Only for Auto Mode games)
  useEffect(() => {
    if (!autoMode || !sessionId || !gameState || gameState.game_over || aiLoading || isManualMode) {
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        const hint = await api.getHint(sessionId);
        const [r, c] = hint.recommended_move;
        setAiHintCell({ r, c });
        setTimeout(() => handleAutoMove(r, c), 200);
      } catch (e) {
        setAutoMode(false);
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [autoMode, sessionId, gameState, aiLoading, isManualMode]);

  // --- Render ---

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

        {/* Left: Board & Input */}
        <div className="flex flex-col gap-6 justify-start">
          <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Catch the King
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {isManualMode ? "Manual Mode: Input value for the AI-selected card." : "Auto Mode: Click to reveal."}
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-lg border border-slate-800">
              <button
                onClick={() => startNewGame(false)}
                className={cn("px-3 py-1.5 rounded text-sm font-medium transition-all", !isManualMode ? "bg-slate-700 text-white shadow" : "text-slate-500 hover:text-slate-300")}
              >
                Auto
              </button>
              <button
                onClick={() => startNewGame(true)}
                className={cn("px-3 py-1.5 rounded text-sm font-medium transition-all", isManualMode ? "bg-emerald-900 text-emerald-100 shadow" : "text-slate-500 hover:text-slate-300")}
              >
                Manual
              </button>
            </div>
          </header>

          {/* Grid Container */}
          <div className="relative w-full max-w-[600px] mx-auto bg-slate-900/50 p-4 rounded-xl border border-slate-800 shadow-2xl">
            <div className="grid grid-cols-5 gap-3 w-full">
              {gameState.grid.map((row, rIndex) =>
                row.map((cell, cIndex) => {
                  const isTempRevealed = tempRevealed?.r === rIndex && tempRevealed?.c === cIndex;
                  const isTrapHint = trapHintCells.some(([tr, tc]) => tr === rIndex && tc === cIndex);
                  const isAiHint = aiHintCell?.r === rIndex && aiHintCell?.c === cIndex;
                  const isSelected = selectedCell?.r === rIndex && selectedCell?.c === cIndex;

                  // Visibility Logic
                  const isVisible = cell.revealed || isTempRevealed || (gameState.game_over && cell.value !== null);

                  // Value to Display
                  let displayContent: React.ReactNode = null;

                  if (isVisible) {
                     const val = (cell.revealed || gameState.game_over) ? cell.value : tempRevealed?.val;
                     displayContent = val === 6 ? <Crown size={32} fill="currentColor" /> : val;
                  } else if (gameState.game_over && cell.value === null) {
                     displayContent = <span className="text-slate-600 text-2xl font-bold">?</span>;
                  }

                  // Interactions: Valid move if NOT manual (manual is driven by AI state)
                  const isValidMove = gameState.valid_moves.some(([r, c]) => r === rIndex && c === cIndex);
                  // In Manual mode, you can't click. In Auto, you can click valid moves.
                  const isDisabled = gameState.game_over || (isManualMode ? true : !isValidMove);

                  return (
                    <button
                      key={`${rIndex}-${cIndex}`}
                      onClick={() => handleTileClick(rIndex, cIndex)}
                      disabled={isDisabled}
                      className={cn(
                        "relative w-full aspect-square flex items-center justify-center text-xl sm:text-3xl font-bold rounded-lg transition-all duration-200",
                        "shadow-lg",
                        getCardColor(isVisible ? (cell.value ?? tempRevealed?.val ?? null) : null),

                        // Passive Reveal / Game Over ?
                        (gameState.game_over && !cell.revealed) && "opacity-60 grayscale border-dashed border-2",

                        // Hover Effects (Only active in Auto Mode)
                        !isManualMode && !isVisible && isValidMove && !gameState.game_over && "hover:bg-slate-700 cursor-pointer hover:border-emerald-500/30",

                        // Selection (Manual Mode target)
                        isSelected && "ring-4 ring-emerald-400 z-20 scale-105 border-emerald-400 bg-slate-700",

                        // AI Hint (Secondary highlight)
                        isAiHint && !isVisible && !isSelected && "animate-pulse ring-4 ring-cyan-500/50 z-10 scale-105",

                        // Disabled / Invalid
                        isDisabled && !isVisible && !gameState.game_over && !isSelected && "opacity-40 cursor-not-allowed",

                        // Completion
                        (gameState.rows_completed[rIndex] || gameState.cols_completed[cIndex]) && isVisible && "brightness-125 ring-2 ring-yellow-500/20"
                      )}
                    >
                      {displayContent !== null ? (
                         <span className={cn("drop-shadow-md", displayContent === 6 ? "text-yellow-400 scale-110" : "")}>{displayContent}</span>
                      ) : (
                        <div className="w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-500 to-transparent rounded-lg" />
                      )}

                      {/* Overlays */}
                      {isTrapHint && !isVisible && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg animate-in fade-in duration-300 z-20">
                          <Skull className="text-red-500 animate-bounce" size={28} />
                        </div>
                      )}
                      {isSelected && (
                         <div className="absolute -top-2 -right-2 bg-emerald-500 rounded-full p-1 text-black shadow-lg animate-in zoom-in duration-200">
                           <Target size={12} />
                         </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* MANUAL INPUT PANEL (Below Board) */}
          {gameState.is_manual && !gameState.game_over && (
            <div className={cn(
              "w-full max-w-[600px] mx-auto transition-all duration-500 overflow-hidden",
              selectedCell ? "max-h-96 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-4"
            )}>
              <div className="bg-slate-900 border-2 border-slate-700 p-5 rounded-xl shadow-2xl relative">
                <div className="flex items-center justify-between mb-4">
                   <h3 className="font-bold text-lg text-emerald-100 flex items-center gap-2">
                     <Target size={20} className="text-emerald-500"/>
                     Input Card at ({selectedCell?.r}, {selectedCell?.c})
                   </h3>
                   {/* Close button removed: User must input value for the selected field */}
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {[1, 2, 3, 4, 5, 6].map(v => (
                    <button
                      key={v}
                      onClick={() => setInputVal(v)}
                      className={cn(
                        "flex-1 min-w-[3rem] h-14 rounded-lg text-xl font-bold border-2 transition-all flex items-center justify-center",
                        inputVal === v
                          ? "bg-emerald-600 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500"
                      )}
                    >
                      {v === 6 ? 'K' : v}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div
                    onClick={() => setInputHint(!inputHint)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors flex-1",
                      inputHint ? "bg-cyan-950/50 border-cyan-500" : "bg-slate-800 border-slate-700 hover:border-slate-600"
                    )}
                  >
                    <div className={cn("w-5 h-5 rounded border flex items-center justify-center", inputHint ? "bg-cyan-500 border-cyan-500" : "border-slate-500 bg-slate-900")}>
                      {inputHint && <Check size={14} className="text-black stroke-[3]"/>}
                    </div>
                    <span className={cn("text-sm font-semibold", inputHint ? "text-cyan-300" : "text-slate-400")}>
                      Hint Visible? <span className="text-xs font-normal opacity-70">(5 adjacent)</span>
                    </span>
                  </div>

                  <button
                    onClick={handleManualSubmit}
                    disabled={inputVal === null || aiLoading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg shadow-lg flex items-center justify-center gap-2"
                  >
                    {aiLoading ? (
                       <>Processing...</>
                    ) : (
                       <>Confirm <Check size={18}/></>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  onClick={() => startNewGame(isManualMode)}
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
              {/* Manual Mode: AI Hint is automatic, so we hide the button. Auto Mode: Show it. */}
              {!isManualMode && (
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
              )}

              {!isManualMode && (
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
              )}

              <button
                onClick={() => startNewGame(isManualMode)}
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