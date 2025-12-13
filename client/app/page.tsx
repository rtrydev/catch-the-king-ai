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
  Medal,
  Frown,
  Check,
  Target,
  BarChart3,
  Play,
  Square,
  Activity,
  Zap,
  TrendingUp,
  TrendingDown,
  BookOpen,
  X,
  AlertTriangle,
  Eye,
  EyeOff, // Added
  Grid3X3
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import confetti from 'canvas-confetti';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const SCORE_SILVER = 400;
const SCORE_GOLD = 550;

// --- Visual Helpers ---

const getCardColor = (value: number | null) => {
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

const formatValue = (val: number | null) => (val === 6 ? 'K' : val);

export default function CatchTheKing() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [gameMode, setGameMode] = useState<'auto' | 'manual' | 'eval'>('auto');

  // Rules Modal State
  const [showRules, setShowRules] = useState(false);

  // Visual states
  const [tempRevealed, setTempRevealed] = useState<{r: number, c: number, val: number} | null>(null);
  const [trapHintCells, setTrapHintCells] = useState<number[][]>([]);
  const [aiHintCell, setAiHintCell] = useState<{r: number, c: number} | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [autoPlayActive, setAutoPlayActive] = useState(false);

  // Manual Mode State
  const [selectedCell, setSelectedCell] = useState<{r: number, c: number} | null>(null);
  const [inputVal, setInputVal] = useState<number | null>(null);
  const [inputHint, setInputHint] = useState(false);

  // Evaluation Mode State
  const [evalTarget, setEvalTarget] = useState<number>(100);
  const [evalScores, setEvalScores] = useState<number[]>([]);
  const [isEvalRunning, setIsEvalRunning] = useState(false);
  const [hoveredData, setHoveredData] = useState<{ index: number; score: number; x: number; y: number } | null>(null);

  const stopEvalRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Timer refs
  const tempRevealedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const trapHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Helper to clear visual hints immediately ---
  const clearVisualHints = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (gameMode !== 'eval') {
      startNewGame(gameMode === 'manual');
    }
  }, [gameMode]);

  const startNewGame = async (manual: boolean) => {
    setLoading(true);
    setAutoPlayActive(false);
    clearVisualHints();
    try {
      const { session_id } = await api.createGame(manual);
      setSessionId(session_id);
      const state = await api.getState(session_id);
      setGameState(state);
      setAiHintCell(null);
      setInputVal(null);
      setInputHint(false);

      if (manual) {
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

  // --- Handlers ---
  const handleTileClick = (row: number, col: number) => {
    if (!sessionId || !gameState || gameState.game_over || gameState.is_manual) return;
    handleAutoMove(row, col);
  };

  const handleManualSubmit = async () => {
    if (!selectedCell || !sessionId || inputVal === null) return;
    const { r, c } = selectedCell;
    clearVisualHints();
    setAiLoading(true);

    try {
      const res = await api.makeManualMove(sessionId, r, c, inputVal, inputHint);
      await processMoveResult(res, r, c, inputVal);
      if (!res.game_over) {
        const nextHint = await api.getHint(sessionId);
        const [nr, nc] = nextHint.recommended_move;
        setAiHintCell({ r: nr, c: nc });
        setSelectedCell({ r: nr, c: nc });
        setInputVal(null);
        setInputHint(false);
      } else {
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
    clearVisualHints();

    try {
      const res = await api.makeMove(sessionId, row, col);
      const newState = await api.getState(sessionId);
      const val = newState.grid[row][col].value;
      processMoveResult(res, row, col, val, newState);
    } catch (e) {
      console.error("Auto move failed", e);
    }
  };

  const processMoveResult = async (res: any, row: number, col: number, knownValue: number | null, providedState?: GameStateResponse) => {
    if (!sessionId) return;
    const newState = providedState || await api.getState(sessionId);

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

    if (res.game_over && res.score >= SCORE_SILVER && gameMode !== 'eval') {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
    setGameState(newState);
  };

  const handleAskAI = async () => {
    if (!sessionId || !gameState || gameState.game_over || aiLoading) return;
    clearVisualHints();
    setAiLoading(true);
    try {
      const hint = await api.getHint(sessionId);
      const [r, c] = hint.recommended_move;
      setAiHintCell({ r, c });
      if (gameMode === 'manual') {
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

  useEffect(() => {
    if (!autoPlayActive || !sessionId || !gameState || gameState.game_over || aiLoading || gameMode === 'manual' || gameMode === 'eval') {
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        const hint = await api.getHint(sessionId);
        const [r, c] = hint.recommended_move;
        setAiHintCell({ r, c });
        setTimeout(() => handleAutoMove(r, c), 200);
      } catch (e) {
        setAutoPlayActive(false);
      }
    }, 800);
    return () => clearTimeout(timeoutId);
  }, [autoPlayActive, sessionId, gameState, aiLoading, gameMode]);

  // --- Evaluation Logic ---
  const runEvaluation = async () => {
    if (isEvalRunning) return;
    setIsEvalRunning(true);
    setEvalScores([]);
    stopEvalRef.current = false;
    const scores: number[] = [];

    for (let i = 0; i < evalTarget; i++) {
      if (stopEvalRef.current) break;
      try {
        const { session_id: sId } = await api.createGame(false);
        let gameOver = false;
        let score = 0;
        while (!gameOver) {
          if (stopEvalRef.current) break;
          const hint = await api.getHint(sId);
          const [r, c] = hint.recommended_move;
          const res = await api.makeMove(sId, r, c);
          if (res.game_over) {
            gameOver = true;
            score = res.score;
          }
        }
        if (!stopEvalRef.current) {
          scores.push(score);
          setEvalScores([...scores]);
        }
      } catch (err) { console.error("Eval error", err); }
      // Brief pause to allow UI update
      if (i % 2 === 0) await new Promise(r => setTimeout(r, 0));
    }
    setIsEvalRunning(false);
  };

  // --- Canvas Interaction Logic ---
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameMode !== 'eval' || evalScores.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // Dimensions (must match Draw logic)
    const padding = 20 * (window.devicePixelRatio || 1);
    const topChartHeight = (canvas.height / 2) - padding;

    // Only interact with the Top Chart (Timeline)
    if (mouseY > topChartHeight + padding) {
      setHoveredData(null);
      return;
    }

    // Graph Width calc
    const graphW = canvas.width - (padding * 2);
    const barWidth = graphW / evalScores.length;

    // Find Index
    if (mouseX >= padding && mouseX <= canvas.width - padding) {
      const index = Math.floor((mouseX - padding) / barWidth);
      if (index >= 0 && index < evalScores.length) {
        setHoveredData({
          index,
          score: evalScores[index],
          x: mouseX / scaleX,
          y: mouseY / scaleY
        });
        return;
      }
    }
    setHoveredData(null);
  };

  const handleCanvasMouseLeave = () => setHoveredData(null);

  // --- Canvas Drawing (Updated Thresholds & Dynamic Range) ---
  useEffect(() => {
    if (gameMode !== 'eval' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const w = canvas.width;
    const h = canvas.height;
    const p = 20 * dpr; // padding

    // Colors
    const cBarGold = '#eab308'; // Yellow-500
    const cBarSilver = '#94a3b8'; // Slate-400 (Silver-ish)
    const cBarBlue = '#60a5fa'; // Blue-400 (Light Blue for < 400)
    const cBarLow = '#334155'; // Slate-700 (Unused for bars now, but kept for reference)
    const cText = '#94a3b8'; // Slate 400

    ctx.clearRect(0, 0, w, h);

    if (evalScores.length === 0) {
      ctx.fillStyle = cText;
      ctx.font = `${16 * dpr}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText("Ready to Evaluate", w/2, h/2);
      return;
    }

    // --- 1. TOP CHART: Game Timeline ---
    const topH = (h / 2) - (p * 1.5);
    const topY = p;

    // Background Rect
    ctx.fillStyle = '#0f172a'; // slightly lighter than main bg
    ctx.beginPath();
    ctx.roundRect(0, 0, w, topH + p, 12 * dpr);
    ctx.fill();

    // Title
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${12 * dpr}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`GAME TIMELINE (LAST ${evalScores.length})`, p, p * 1.5);

    // Chart Area
    const tGraphX = p;
    const tGraphY = p * 2.5;
    const tGraphW = w - (p * 2);
    const tGraphH = topH - (p * 1.5);

    // Timeline Scale usually fixed to show performance relative to Max possible
    const maxValTimeline = Math.max(650, ...evalScores);

    const barW = tGraphW / evalScores.length;

    // Draw Timeline Bars
    evalScores.forEach((score, i) => {
      const bh = (score / maxValTimeline) * tGraphH;
      const bx = tGraphX + (i * barW);
      const by = tGraphY + tGraphH - bh;

      // Color Logic
      if (score >= SCORE_GOLD) ctx.fillStyle = cBarGold;
      else if (score >= SCORE_SILVER) ctx.fillStyle = cBarSilver;
      else ctx.fillStyle = cBarBlue; // Light blue for < 400

      if (hoveredData?.index === i) {
        ctx.fillStyle = '#ffffff';
      }

      ctx.fillRect(bx, by, Math.max(barW - (1 * dpr), 0.5 * dpr), bh);
    });

    // Threshold Line (Silver)
    const ySilver = tGraphY + tGraphH - ((SCORE_SILVER / maxValTimeline) * tGraphH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(tGraphX, ySilver);
    ctx.lineTo(tGraphX + tGraphW, ySilver);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = `bold ${10 * dpr}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${SCORE_SILVER}`, w - p, ySilver - 4);

    // Threshold Line (Gold)
    const yGold = tGraphY + tGraphH - ((SCORE_GOLD / maxValTimeline) * tGraphH);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
    ctx.beginPath();
    ctx.moveTo(tGraphX, yGold);
    ctx.lineTo(tGraphX + tGraphW, yGold);
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.fillText(`${SCORE_GOLD}`, w - p, yGold - 4);

    ctx.setLineDash([]); // Reset

    // --- 2. BOTTOM CHART: Score Distribution (Dynamic Range) ---
    const botY = topH + (p * 2.5);
    const botH = h - botY - p;

    // Background Rect
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(0, botY - p, w, botH + (p*2), 12 * dpr);
    ctx.fill();

    // Title
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${12 * dpr}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText("SCORE DISTRIBUTION", p, botY);

    // Dynamic Range Logic
    const binSize = 10;
    const rawMin = Math.min(...evalScores);
    const rawMax = Math.max(...evalScores);

    // Round down to nearest 50 for aesthetic start, or just use raw data?
    // Usually rounding to nearest binSize is safer.
    const minScore = Math.floor(rawMin / binSize) * binSize;
    // Ensure max is at least min + some range
    const maxScore = Math.max(Math.ceil(rawMax / binSize) * binSize, minScore + (binSize * 10));

    const bins: Record<number, number> = {};
    let maxFreq = 0;

    evalScores.forEach(s => {
      // Clamp just in case (though dynamics should cover it)
      let val = s;
      const b = Math.floor(val / binSize) * binSize;
      bins[b] = (bins[b] || 0) + 1;
      maxFreq = Math.max(maxFreq, bins[b]);
    });

    const bGraphX = p;
    const bGraphY = botY + p;
    const bGraphW = w - (p * 2);
    const bGraphH = botH - (p * 2);

    const totalBins = (maxScore - minScore) / binSize;
    // Avoid division by zero
    const safeTotalBins = totalBins < 1 ? 1 : totalBins + 1;
    const histBarW = bGraphW / safeTotalBins;

    // Draw Histogram
    for (let b = minScore; b <= maxScore; b += binSize) {
      const freq = bins[b] || 0;
      const hBarH = maxFreq > 0 ? (freq / maxFreq) * bGraphH : 0;

      const bIdx = (b - minScore) / binSize;
      const bx = bGraphX + (bIdx * histBarW);
      const by = bGraphY + bGraphH - hBarH;

      // Color Logic based on thresholds
      if (b >= SCORE_GOLD) ctx.fillStyle = cBarGold;
      else if (b >= SCORE_SILVER) ctx.fillStyle = cBarSilver;
      else ctx.fillStyle = cBarBlue; // Light blue for < 400

      // Rounded top bars
      const bw = Math.max(histBarW - (2 * dpr), 1);
      ctx.beginPath();
      if (hBarH > 0) {
        ctx.roundRect(bx, by, bw, hBarH, [4 * dpr, 4 * dpr, 0, 0]);
      } else {
         // Tiny placeholder for 0
         ctx.rect(bx, bGraphY + bGraphH - 1, bw, 1);
      }
      ctx.fill();

      // X-Axis Labels (Dynamic spacing)
      // Only draw label if it fits roughly
      const labelStep = totalBins > 20 ? 5 : totalBins > 10 ? 2 : 1;
      const currentBinIdx = (b - minScore) / binSize;

      if (currentBinIdx % labelStep === 0) {
        ctx.save();
        ctx.translate(bx + (bw / 2), bGraphY + bGraphH + (10 * dpr));
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'right';
        ctx.font = `${9 * dpr}px sans-serif`;
        ctx.fillText(b.toString(), 0, 0);
        ctx.restore();
      }
    }

  }, [evalScores, gameMode, hoveredData]);

  // --- Metrics Calculation ---
  const avgScore = evalScores.length ? Math.round(evalScores.reduce((a, b) => a + b, 0) / evalScores.length) : 0;
  const minScore = evalScores.length ? Math.min(...evalScores) : 0;
  const maxScore = evalScores.length ? Math.max(...evalScores) : 0;
  const silverCount = evalScores.filter(s => s >= SCORE_SILVER).length;
  const goldCount = evalScores.filter(s => s >= SCORE_GOLD).length;
  const silverPct = evalScores.length ? ((silverCount / evalScores.length) * 100).toFixed(1) : "0.0";
  const goldPct = evalScores.length ? ((goldCount / evalScores.length) * 100).toFixed(1) : "0.0";
  const isSilver = gameState ? gameState.score >= SCORE_SILVER : false;
  const isGold = gameState ? gameState.score >= SCORE_GOLD : false;

  const getModeLabel = (m: string) => {
    if (m === 'auto') return 'AI Assisted';
    if (m === 'manual') return 'Solver';
    if (m === 'eval') return 'Evaluation';
    return m.charAt(0).toUpperCase() + m.slice(1);
  };

  const getModeDescription = () => {
    if (gameMode === 'eval') return "Model Performance Analysis";
    if (gameMode === 'auto') return "Cooperation Mode";
    if (gameMode === 'manual') return "Manual Solver";
    return "";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 overflow-x-hidden">

      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 md:p-8 h-full flex flex-col gap-6">

        {/* --- Header --- */}
        <header className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 pb-4 border-b border-slate-800/60">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent drop-shadow-sm">
              Catch the King
            </h1>
            <p className="text-slate-400 font-medium text-sm mt-1 flex items-center gap-2">
              {gameMode === 'eval' ? <Activity size={16} className="text-indigo-400"/> : <Zap size={16} className="text-emerald-400"/>}
              {getModeDescription()}
            </p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/50 flex shadow-lg">
            {(['auto', 'manual', 'eval'] as const).map(m => (
              <button
                key={m}
                onClick={() => setGameMode(m)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer",
                  gameMode === m
                    ? "bg-slate-700 text-white shadow-inner"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
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

        {/* --- MAIN CONTENT AREA --- */}
        <div className={cn(
          "grid gap-8 transition-all duration-500",
          gameMode === 'eval' ? "grid-cols-1 max-w-5xl mx-auto w-full" : "lg:grid-cols-[1fr_350px]"
        )}>

          {/* LEFT COLUMN (In Eval mode, this becomes the only column) */}
          <div className="flex flex-col gap-6">

            {gameMode === 'eval' ? (
              // --- EVALUATION MODE UI ---
              <div key="eval-ui" className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">

                {/* 1. Control Deck */}
                <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-6 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-6">
                   <div className="flex items-center gap-4">
                      <div className="flex flex-col">
                        <label className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Simulations</label>
                        <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 px-3">
                           <input
                             type="number"
                             min="1" max="2000"
                             value={evalTarget}
                             onChange={(e) => setEvalTarget(Math.max(1, parseInt(e.target.value) || 0))}
                             disabled={isEvalRunning}
                             className="bg-transparent text-white font-mono py-2 w-20 focus:outline-none"
                           />
                           <span className="text-slate-500 text-sm">runs</span>
                        </div>
                      </div>

                      <button
                        onClick={isEvalRunning ? () => stopEvalRef.current = true : runEvaluation}
                        className={cn(
                          "flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 cursor-pointer",
                          isEvalRunning
                            ? "bg-red-500/80 hover:bg-red-500 shadow-red-900/30"
                            : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/30"
                        )}
                      >
                         {isEvalRunning ? <Square size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
                         {isEvalRunning ? "Stop" : "Run Model"}
                      </button>
                   </div>

                   {/* Progress */}
                   <div className="flex items-center gap-4">
                     <div className="text-right">
                       <div className="text-xs text-slate-400 uppercase font-bold">Games Played</div>
                       <div className="text-2xl font-mono text-white">
                         {evalScores.length} <span className="text-slate-500">/ {evalTarget}</span>
                       </div>
                     </div>
                     <div className="w-12 h-12 rounded-full border-4 border-slate-700 flex items-center justify-center relative">
                        <div
                          className="absolute inset-0 rounded-full border-4 border-indigo-500 transition-all duration-300"
                          style={{ clipPath: `inset(0 0 ${(1 - (evalScores.length/evalTarget)) * 100}% 0)` }}
                        />
                     </div>
                   </div>
                </div>

                {/* 2. Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {/* Min Score */}
                  <div className="bg-slate-900/40 backdrop-blur border border-slate-700/50 p-4 rounded-xl flex flex-col items-center justify-center gap-1 text-center group hover:bg-slate-900/60 transition-colors">
                     <TrendingDown size={20} className="text-pink-400 mb-1"/>
                     <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Min Score</div>
                     <div className="text-2xl font-bold text-pink-100 tracking-tight">{minScore}</div>
                  </div>

                  {/* Avg Score */}
                  <div className="bg-slate-900/40 backdrop-blur border border-slate-700/50 p-4 rounded-xl flex flex-col items-center justify-center gap-1 text-center group hover:bg-slate-900/60 transition-colors">
                     <Activity size={20} className="text-indigo-400 mb-1"/>
                     <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Avg Score</div>
                     <div className="text-2xl font-bold text-white tracking-tight">{avgScore}</div>
                  </div>

                  {/* Max Score */}
                  <div className="bg-slate-900/40 backdrop-blur border border-slate-700/50 p-4 rounded-xl flex flex-col items-center justify-center gap-1 text-center group hover:bg-slate-900/60 transition-colors">
                     <TrendingUp size={20} className="text-cyan-400 mb-1"/>
                     <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Max Score</div>
                     <div className="text-2xl font-bold text-cyan-100 tracking-tight">{maxScore}</div>
                  </div>

                   {/* Silver Rate */}
                  <div className="bg-slate-900/40 backdrop-blur border border-slate-700/50 p-4 rounded-xl flex flex-col items-center justify-center gap-1 text-center group hover:bg-slate-900/60 transition-colors">
                     <Medal size={20} className="text-slate-300 mb-1"/>
                     <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Silver Rate</div>
                     <div className="text-2xl font-bold text-slate-200 tracking-tight">{silverPct}%</div>
                  </div>

                  {/* Gold Rate */}
                  <div className="bg-slate-900/40 backdrop-blur border border-slate-700/50 p-4 rounded-xl flex flex-col items-center justify-center gap-1 text-center group hover:bg-slate-900/60 transition-colors">
                     <Trophy size={20} className="text-yellow-400 mb-1"/>
                     <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Gold Rate</div>
                     <div className="text-2xl font-bold text-yellow-400 tracking-tight">{goldPct}%</div>
                  </div>
                </div>

                {/* 3. Dual Visualization Canvas */}
                <div className="relative w-full aspect-[9/10] sm:aspect-[2/1] bg-transparent rounded-2xl overflow-hidden shadow-2xl">
                  <canvas
                    ref={canvasRef}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseLeave={handleCanvasMouseLeave}
                    className="w-full h-full object-contain cursor-crosshair"
                    style={{ width: '100%', height: '100%' }}
                  />
                  {/* Tooltip */}
                  {hoveredData && (
                    <div
                      className="absolute pointer-events-none bg-slate-800/95 backdrop-blur border border-slate-600 text-white text-xs p-2 rounded shadow-xl z-20 flex flex-col items-center min-w-[80px]"
                      style={{
                        left: hoveredData.x,
                        top: hoveredData.y - 60,
                        transform: 'translateX(-50%)'
                      }}
                    >
                      <span className="text-slate-400 font-bold uppercase text-[10px]">Game {hoveredData.index + 1}</span>
                      <span className={cn("text-lg font-bold", hoveredData.score >= SCORE_GOLD ? "text-yellow-400" : hoveredData.score >= SCORE_SILVER ? "text-slate-200" : "text-blue-300")}>
                        {hoveredData.score}
                      </span>
                      <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-600"></div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // --- STANDARD GAME UI ---
              <>
                <div key="game-ui" className="relative w-full max-w-[600px] mx-auto bg-slate-900/60 backdrop-blur-xl p-6 rounded-2xl border border-slate-700/50 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                  {loading && !gameState ? (
                     <div className="h-96 flex flex-col items-center justify-center text-slate-400 animate-pulse">
                        <div className="w-16 h-16 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                        <p>Initializing...</p>
                     </div>
                  ) : gameState && (
                    <div className="grid grid-cols-5 gap-3 w-full">
                      {gameState.grid.map((row, rIndex) =>
                        row.map((cell, cIndex) => {
                          const isTempRevealed = tempRevealed?.r === rIndex && tempRevealed?.c === cIndex;
                          const isTrapHint = trapHintCells.some(([tr, tc]) => tr === rIndex && tc === cIndex);
                          const isAiHint = aiHintCell?.r === rIndex && aiHintCell?.c === cIndex;
                          const isSelected = selectedCell?.r === rIndex && selectedCell?.c === cIndex;
                          const isVisible = cell.revealed || isTempRevealed || (gameState.game_over && cell.value !== null);

                          let displayContent: React.ReactNode = null;
                          if (isVisible) {
                            const val = (cell.revealed || gameState.game_over) ? cell.value : tempRevealed?.val;
                            displayContent = val === 6 ? <Crown size={32} fill="currentColor" /> : val;
                          } else if (gameState.game_over && cell.value === null) {
                            displayContent = <span className="text-slate-700 text-2xl font-bold">?</span>;
                          }

                          const isValidMove = gameState.valid_moves.some(([r, c]) => r === rIndex && c === cIndex);
                          const isDisabled = gameState.game_over || (gameMode === 'manual' ? true : !isValidMove);

                          return (
                            <button
                              key={`${rIndex}-${cIndex}`}
                              onClick={() => handleTileClick(rIndex, cIndex)}
                              disabled={isDisabled}
                              className={cn(
                                "relative w-full aspect-square flex items-center justify-center text-xl sm:text-3xl font-bold rounded-xl transition-all duration-300 transform cursor-pointer",
                                "shadow-lg border",
                                getCardColor(isVisible ? (cell.value ?? tempRevealed?.val ?? null) : null),
                                (gameState.game_over && !cell.revealed) && "opacity-40 grayscale border-dashed",
                                gameMode !== 'manual' && !isVisible && isValidMove && !gameState.game_over && "hover:bg-slate-700 hover:scale-105 hover:border-emerald-500/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]",
                                isSelected && "ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 z-20 scale-105 bg-slate-700 border-emerald-400",
                                isAiHint && !isVisible && !isSelected && "animate-pulse ring-2 ring-cyan-400/80 ring-offset-2 ring-offset-slate-900 z-10 scale-105",
                                isDisabled && !isVisible && !gameState.game_over && !isSelected && "opacity-30 cursor-not-allowed border-transparent",
                                (gameState.rows_completed[rIndex] || gameState.cols_completed[cIndex]) && isVisible && "brightness-125 ring-2 ring-yellow-500/40"
                              )}
                            >
                              {displayContent !== null ? (
                                <span className={cn("drop-shadow-lg filter", displayContent === 6 ? "text-yellow-400 scale-110" : "")}>{displayContent}</span>
                              ) : (
                                <div className="w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-400 to-transparent rounded-lg" />
                              )}
                              {isTrapHint && !isVisible && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl animate-in fade-in duration-300 z-20 backdrop-blur-sm border border-red-500/50">
                                  <Skull className="text-red-500 animate-bounce drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" size={28} />
                                </div>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Manual Input Panel */}
                {gameState && gameState.is_manual && !gameState.game_over && (
                  <div className={cn(
                    "w-full max-w-[600px] mx-auto transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden",
                    selectedCell ? "max-h-96 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-8"
                  )}>
                    <div className="bg-slate-900/90 backdrop-blur-xl border border-emerald-500/30 p-6 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.15)] relative">
                      <h3 className="text-emerald-300 font-bold mb-4 flex items-center gap-2">
                         <Target size={18}/> Select Value
                      </h3>
                      <div className="grid grid-cols-6 gap-2 mb-4">
                        {[1, 2, 3, 4, 5, 6].map(v => (
                          <button
                            key={v}
                            onClick={() => setInputVal(v)}
                            className={cn(
                              "aspect-square rounded-lg text-lg font-bold border-2 transition-all flex items-center justify-center cursor-pointer",
                              inputVal === v
                                ? "bg-emerald-600 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] scale-110"
                                : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500"
                            )}
                          >
                            {v === 6 ? 'K' : v}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-3">
                         <button
                            onClick={() => setInputHint(!inputHint)}
                            className={cn("flex-1 py-3 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer",
                              inputHint ? "bg-cyan-900/40 border-cyan-500 text-cyan-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                            )}
                         >
                            <div className={cn("w-4 h-4 rounded border flex items-center justify-center", inputHint ? "bg-cyan-500 border-cyan-500" : "border-slate-500")}>
                               {inputHint && <Check size={10} className="text-black stroke-[4]"/>}
                            </div>
                            Hint
                         </button>
                         <button
                            onClick={handleManualSubmit}
                            disabled={inputVal === null || aiLoading}
                            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                         >
                            {aiLoading ? "Wait..." : "Confirm"}
                         </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT COLUMN: Sidebar Stats (Only visible in Game Modes) */}
          {gameMode !== 'eval' && gameState && (
            <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-500">
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-6 rounded-2xl shadow-xl relative overflow-hidden group">
                 {gameState.game_over && (
                   <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-center animate-in fade-in">
                      {isGold ? <Trophy size={48} className="text-yellow-400 mb-2 animate-bounce"/> : isSilver ? <Medal size={48} className="text-slate-300 mb-2"/> : <Frown size={48} className="text-slate-500 mb-2"/>}
                      <h2 className="text-2xl font-bold text-white mb-1">{isGold ? "Legendary!" : isSilver ? "Well Done" : "Game Over"}</h2>
                      <p className="text-slate-400 text-sm mb-4">Final: {gameState.score}</p>
                      <button onClick={() => startNewGame(gameMode === 'manual')} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-lg transition-transform hover:scale-105 cursor-pointer">Replay</button>
                   </div>
                 )}
                 <div className="flex justify-between items-end mb-2 relative z-0">
                    <span className="text-slate-400 text-xs uppercase font-bold tracking-wider">Score</span>
                    <span className="text-5xl font-black text-white tracking-tighter">{gameState.score}</span>
                 </div>
                 <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative z-0">
                   <div className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-yellow-500 transition-all duration-700" style={{ width: `${Math.min(100, (gameState.score / 600) * 100)}%` }} />
                 </div>
                 <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mt-2 relative z-0">
                    <span className={isSilver ? "text-emerald-400" : ""}>{SCORE_SILVER}</span>
                    <span className={isGold ? "text-yellow-400" : ""}>{SCORE_GOLD}</span>
                 </div>
              </div>

              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-6 rounded-2xl shadow-xl">
                 <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2"><Swords size={14}/> Hand</h3>
                 <div className="flex items-center gap-4">
                    <div className="relative">
                       {gameState.current_card ? (
                         <div className={cn("w-16 h-24 rounded-xl flex items-center justify-center text-2xl font-bold shadow-2xl border-t border-white/20 transition-transform transform hover:-translate-y-2", getCardColor(gameState.current_card))}>
                           {formatValue(gameState.current_card)}
                         </div>
                       ) : (
                         <div className="w-16 h-24 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-xs">Empty</div>
                       )}
                       <div className="text-center text-[10px] text-slate-500 mt-2 uppercase font-bold">Active</div>
                    </div>
                    <div className="flex-1 h-24 relative flex items-center pl-2">
                       {gameState.hand.slice(1, 6).map((c, i) => (
                         <div key={i} className="absolute w-14 h-20 rounded-lg bg-slate-800 border border-slate-600 shadow-md flex items-center justify-center text-lg font-bold text-slate-400 transition-all hover:translate-y-[-5px]" style={{ left: i * 25, zIndex: 10 - i }}>
                           {i < 2 ? formatValue(c) : ''}
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              {!gameState.game_over && (
                <div className="flex flex-col gap-3">
                   {gameMode !== 'manual' && (
                     <button
                       onClick={handleAskAI}
                       disabled={aiLoading || autoPlayActive}
                       className="group bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-200 p-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
                     >
                        {aiLoading ? <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin"/> : <BrainCircuit size={18} className="group-hover:scale-110 transition-transform"/>}
                        Ask AI
                     </button>
                   )}
                   {gameMode !== 'manual' && (
                     <button
                       onClick={() => setAutoPlayActive(!autoPlayActive)}
                       className={cn("p-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3 shadow-lg border cursor-pointer",
                         autoPlayActive
                           ? "bg-emerald-900/50 border-emerald-500/50 text-emerald-300 animate-pulse"
                           : "bg-cyan-600 hover:bg-cyan-500 border-transparent text-white"
                       )}
                     >
                        <Zap size={18} className={cn(autoPlayActive && "animate-bounce")} />
                        {autoPlayActive ? "Autopilot On" : "Start Autopilot"}
                     </button>
                   )}
                   {/* Rules Button for AI Assisted Mode */}
                   {gameMode === 'auto' && (
                     <button
                       onClick={() => setShowRules(true)}
                       className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-700"
                     >
                        <BookOpen size={16}/> Rules
                     </button>
                   )}
                   <button onClick={() => startNewGame(gameMode === 'manual')} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
                      <RotateCcw size={16}/> Restart
                   </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl relative flex flex-col gap-0 max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden">

            {/* Header */}
            <div className="p-6 border-b border-slate-700 bg-slate-900 z-10 flex justify-between items-center shrink-0">
               <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                 <BookOpen className="text-emerald-400"/> Game Rules
               </h2>
               <button
                 onClick={() => setShowRules(false)}
                 className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-800 rounded-lg"
               >
                 <X size={24} />
               </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 text-slate-300 leading-relaxed">

              <section>
                <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-xs mb-2">The Objective</h3>
                <p className="text-sm">
                  Find the hidden <strong className="text-yellow-400">King (K)</strong> and score as many points as possible. You play against a 5x5 grid of hidden cards.
                </p>
              </section>

              <section>
                <h3 className="text-indigo-400 font-bold uppercase tracking-wider text-xs mb-3">Your Deck</h3>
                <p className="text-sm mb-2">
                   You start with the lowest card. If your turn ends, you draw the next one.
                </p>
                <div className="flex gap-2 flex-wrap">
                   {[1, 1, 1, 1, 1].map((v, i) => <div key={'1-'+i} className="px-2 py-1 bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 rounded text-xs font-bold">1</div>)}
                   {[2, 2].map((v, i) => <div key={'2-'+i} className="px-2 py-1 bg-blue-900/50 border border-blue-500/30 text-blue-300 rounded text-xs font-bold">2</div>)}
                   {[3, 3].map((v, i) => <div key={'3-'+i} className="px-2 py-1 bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 rounded text-xs font-bold">3</div>)}
                   <div className="px-2 py-1 bg-purple-900/50 border border-purple-500/30 text-purple-300 rounded text-xs font-bold">4</div>
                   <div className="px-2 py-1 bg-orange-900/50 border border-orange-500/30 text-orange-300 rounded text-xs font-bold">5</div>
                   <div className="px-2 py-1 bg-yellow-900/50 border border-yellow-500/30 text-yellow-300 rounded text-xs font-bold">K</div>
                </div>
              </section>

              <section>
                <h3 className="text-cyan-400 font-bold uppercase tracking-wider text-xs mb-3">Interactions</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">{'>'}</div>
                    <div>
                      <strong className="text-emerald-300">Win & Continue:</strong> If your card is <strong className="text-white">greater</strong> than the hidden card, you get points equal to the revealed card. You <strong>keep your card</strong> and play again.
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">{'='}</div>
                    <div>
                      <strong className="text-blue-300">Tie & Switch:</strong> If cards are <strong className="text-white">equal</strong>, you get points. Your turn ends, and you move to the next card in your deck.
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs">
                      <EyeOff size={16} />
                    </div>
                    <div>
                      <strong className="text-red-300">Loss & Re-hide:</strong> If your card is <strong className="text-white">lower</strong>, you get 0 points. The hidden card stays on the board and is <strong className="text-white">re-hidden</strong>. Your turn ends.
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-pink-400 font-bold uppercase tracking-wider text-xs mb-3">Special Rules & Traps</h3>
                <ul className="space-y-2 text-sm list-disc list-inside marker:text-pink-500">
                  <li>
                    <strong className="text-white">Trap Hint:</strong> If you reveal a card and a hidden <strong className="text-orange-400">[5]</strong> is among the 8 neighbors, the neighbors will flash briefly.
                    <p className="text-slate-400 text-xs ml-5 mt-1">
                      <span className="text-indigo-300"><Eye size={12} className="inline mr-1"/> Strategy:</span> Hints disappear. Watch carefully! If a hint appears from one side but not another, you can triangulate where the [5] is.
                    </p>
                  </li>
                  <li>
                    <strong className="text-white">The "5" Hazard:</strong> If you play a <strong className="text-orange-400">[5]</strong> and a neighbor is a hidden [5], your card is <strong className="text-red-400">captured</strong>. Turn over, no points.
                  </li>
                  <li>
                    <strong className="text-white">The King:</strong> If you play <strong className="text-yellow-400">[K]</strong> and find the King, you get 100 pts and the game ends. If you reveal anything else with the King, the game ends immediately.
                  </li>
                  <li>
                    <strong className="text-white">Row Bonus:</strong> Clearing a whole row or column gives <strong className="text-emerald-400">+10 points</strong>.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="text-slate-400 font-bold uppercase tracking-wider text-xs mb-3">Board Distribution & Scoring</h3>
                <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700/50">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-800 text-slate-400 font-bold text-xs uppercase">
                      <tr>
                        <th className="p-3">Card</th>
                        <th className="p-3">Count</th>
                        <th className="p-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      <tr><td className="p-3 font-bold text-emerald-400">1</td><td className="p-3">7</td><td className="p-3 text-right">10</td></tr>
                      <tr><td className="p-3 font-bold text-blue-400">2</td><td className="p-3">4</td><td className="p-3 text-right">20</td></tr>
                      <tr><td className="p-3 font-bold text-indigo-400">3</td><td className="p-3">5</td><td className="p-3 text-right">30</td></tr>
                      <tr><td className="p-3 font-bold text-purple-400">4</td><td className="p-3">5</td><td className="p-3 text-right">40</td></tr>
                      <tr><td className="p-3 font-bold text-orange-400">5</td><td className="p-3">3</td><td className="p-3 text-right">50</td></tr>
                      <tr><td className="p-3 font-bold text-yellow-400">K</td><td className="p-3">1</td><td className="p-3 text-right">100</td></tr>
                    </tbody>
                  </table>
                </div>
              </section>

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-700 bg-slate-900 z-10 shrink-0">
               <button
                onClick={() => setShowRules(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg"
              >
                Close Rules
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}