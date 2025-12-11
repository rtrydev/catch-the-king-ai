"use client";

import { useState, useEffect } from "react";
import Card from "@/components/card";
import { RefreshCw, Trophy, AlertTriangle, Sparkles, BrainCircuit, Eye } from "lucide-react"; // Added icons

// ... (Previous Types: CellState, GameResponse ...)
// Note: Ensure CellState matches backend
type CellState = {
    row: number;
    col: number;
    value: number | null;
    is_revealed: boolean;
    is_known: boolean;
    is_highlighted: boolean;
};

type GameResponse = {
  game_id: string;
  score: number;
  game_over: boolean;
  active_card: number | null;
  hand_counts: Record<string, number>;
  grid: CellState[][];
  message: string;
};

const API_URL = "http://localhost:8000";

export default function Home() {
  const [gameState, setGameState] = useState<GameResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [hintLoading, setHintLoading] = useState(false); // New loading state
  const [error, setError] = useState("");
  const [hint, setHint] = useState<{row: number, col: number} | null>(null); // New hint state

  const startNewGame = async () => {
    setLoading(true);
    setHint(null); // Clear hint
    try {
      const res = await fetch(`${API_URL}/new-game`, { method: "POST" });
      const data = await res.json();
      setGameState(data);
      setError("");
    } catch (err) {
      setError("Failed to connect to game server.");
    } finally {
      setLoading(false);
    }
  };

  // --- NEW: AI Hint Function ---
  const getAiHint = async () => {
    if (!gameState || gameState.game_over) return;
    setHintLoading(true);
    try {
        const res = await fetch(`${API_URL}/hint/${gameState.game_id}`);
        if (!res.ok) throw new Error("Failed to get hint");
        const data = await res.json(); // {row, col}
        setHint(data);
    } catch (err) {
        console.error(err);
    } finally {
        setHintLoading(false);
    }
  };

  const handleCardClick = async (r: number, c: number) => {
    if (!gameState || gameState.game_over || loading) return;
    if (gameState.grid[r][c].is_revealed) return;

    // Clear hint when user makes a move (whether they followed it or not)
    setHint(null);

    try {
      const res = await fetch(`${API_URL}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameState.game_id, row: r, col: c }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.detail);
        return;
      }

      const data = await res.json();
      setGameState(data);
    } catch (err) {
      setError("Error making move.");
    }
  };

  useEffect(() => {
    startNewGame();
  }, []);

  if (!gameState) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col items-center py-8">

      {/* Header */}
      <div className="w-full max-w-4xl px-6 mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-200 to-yellow-500 bg-clip-text text-transparent">
            Catch the King
          </h1>
          <p className="text-slate-400 text-sm mt-1">Reveal cards, watch for traps, find the King.</p>
        </div>

        <div className="flex gap-4">
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg flex flex-col items-center min-w-[100px]">
            <span className="text-slate-400 text-xs uppercase tracking-wider">Score</span>
            <span className={`text-2xl font-mono font-bold ${gameState.score >= 550 ? 'text-yellow-400' : gameState.score >= 400 ? 'text-slate-300' : 'text-white'}`}>
              {gameState.score}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <button
                onClick={startNewGame}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-semibold"
            >
                <RefreshCw size={16} /> New Game
            </button>

            {/* AI BUTTON */}
            <button
                onClick={getAiHint}
                disabled={hintLoading || gameState.game_over}
                className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-cyan-50 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-semibold border border-cyan-500/30"
            >
                {hintLoading ? (
                    <span className="animate-spin"><RefreshCw size={16}/></span>
                ) : (
                    <BrainCircuit size={16} />
                )}
                Ask AI
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-12 items-start justify-center w-full max-w-5xl px-4">

        <div className="relative">
          <div className="bg-slate-900 p-6 rounded-2xl border-4 border-slate-800 shadow-2xl">
            <div className="grid grid-cols-5 gap-3">
              {gameState.grid.map((row, rIndex) => (
                row.map((cell, cIndex) => (
                  <Card
                    key={`${rIndex}-${cIndex}`}
                    value={cell.value}
                    isRevealed={cell.is_revealed}
                    isKnown={cell.is_known}
                    isHighlighted={cell.is_highlighted}
                    // Pass isHint if coordinates match
                    isHint={hint?.row === rIndex && hint?.col === cIndex}
                    onClick={() => handleCardClick(rIndex, cIndex)}
                    disabled={gameState.game_over}
                    size="md"
                  />
                ))
              ))}
            </div>
          </div>

          {gameState.game_over && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-50">
              <Trophy size={64} className={gameState.score >= 550 ? "text-yellow-400" : "text-slate-400"} />
              <h2 className="text-3xl font-bold mt-4 text-white">Game Over</h2>
              <p className="text-xl mt-2 text-slate-300">Final Score: {gameState.score}</p>
              <button onClick={startNewGame} className="mt-6 bg-white text-black px-6 py-2 rounded-full font-bold hover:scale-105 transition-transform">
                Play Again
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 w-full md:w-64">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col items-center">
            <h3 className="text-slate-400 text-sm uppercase tracking-widest mb-4">Current Card</h3>
            {gameState.active_card ? (
              <Card
                value={gameState.active_card}
                isRevealed={true}
                isKnown={true}
                isHighlighted={false}
                isHint={false}
                size="lg"
                disabled
              />
            ) : (
              <div className="w-24 h-32 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600">
                Empty
              </div>
            )}
            <p className="mt-4 text-center text-sm text-slate-400 min-h-[1.25rem]">
              {gameState.message}
            </p>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <h3 className="text-slate-400 text-sm uppercase tracking-widest mb-4">Remaining Deck</h3>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((val) => {
                const count = gameState.hand_counts[String(val)] || 0;
                return (
                  <div key={val} className={`flex flex-col items-center p-2 rounded-lg border ${count > 0 ? 'bg-slate-800 border-slate-700' : 'bg-slate-900 border-slate-800 opacity-30'}`}>
                    <div className={`font-bold text-lg ${val === 6 ? 'text-red-400' : 'text-slate-200'}`}>
                      {val === 6 ? 'K' : val}
                    </div>
                    <div className="text-xs text-slate-500">x{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-xl text-xs text-slate-400 border border-slate-800 space-y-2">
             <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
                <span>Pulsing Yellow: Neighboring 5 Trap.</span>
             </div>
             <div className="flex items-start gap-2">
                <Sparkles size={14} className="text-cyan-400 shrink-0 mt-0.5" />
                <span>Pulsing Cyan: AI Suggested Move.</span>
             </div>
             <div className="flex items-start gap-2">
                <Eye size={14} className="text-slate-500 shrink-0 mt-0.5" />
                <span>Dimmed: Card known but hidden.</span>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}