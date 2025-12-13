import { useState, useRef, useCallback, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { api } from '@/lib/api';
import { SCORE_SILVER } from '@/lib/constants';
import { GameMode, GameStateResponse, VisualHintState } from '@/types';

export function useGameEngine(gameMode: GameMode) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [autoPlayActive, setAutoPlayActive] = useState(false);

  // Visuals
  const [visuals, setVisuals] = useState<VisualHintState>({
    tempRevealed: null,
    trapHintCells: [],
    aiHintCell: null,
  });

  // Manual Mode State
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);

  // Timers
  const tempRevealedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const trapHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearVisualHints = useCallback(() => {
    if (tempRevealedTimerRef.current) clearTimeout(tempRevealedTimerRef.current);
    if (trapHintTimerRef.current) clearTimeout(trapHintTimerRef.current);
    setVisuals((prev) => ({ ...prev, tempRevealed: null, trapHintCells: [] }));
  }, []);

  const processMoveResult = async (
    res: any,
    row: number,
    col: number,
    knownValue: number | null,
    providedState?: GameStateResponse
  ) => {
    if (!sessionId) return;
    const newState = providedState || (await api.getState(sessionId));

    // Handle re-hidden (loss)
    if (res.re_hidden && knownValue !== null) {
      setVisuals((prev) => ({ ...prev, tempRevealed: { r: row, c: col, val: knownValue } }));
      if (tempRevealedTimerRef.current) clearTimeout(tempRevealedTimerRef.current);
      tempRevealedTimerRef.current = setTimeout(() => {
        setVisuals((prev) => ({ ...prev, tempRevealed: null }));
      }, 1500);
    }

    // Handle trap hint
    if (res.show_hint) {
      const neighbors: any[] = [];
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          const nr = row + i,
            nc = col + j;
          if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) neighbors.push([nr, nc]);
        }
      }
      setVisuals((prev) => ({ ...prev, trapHintCells: neighbors }));
      if (trapHintTimerRef.current) clearTimeout(trapHintTimerRef.current);
      trapHintTimerRef.current = setTimeout(() => {
        setVisuals((prev) => ({ ...prev, trapHintCells: [] }));
      }, 1500);
    }

    // Confetti
    if (res.game_over && res.score >= SCORE_SILVER && gameMode !== 'eval') {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }

    setGameState(newState);
  };

  const startNewGame = useCallback(async (manual: boolean) => {
    setLoading(true);
    setAutoPlayActive(false);
    clearVisualHints();
    try {
      const { session_id } = await api.createGame(manual);
      setSessionId(session_id);
      const state = await api.getState(session_id);
      setGameState(state);
      setVisuals({ tempRevealed: null, trapHintCells: [], aiHintCell: null });

      if (manual) {
        try {
          const hint = await api.getHint(session_id);
          const [r, c] = hint.recommended_move;
          setVisuals(prev => ({ ...prev, aiHintCell: { r, c } }));
          setSelectedCell({ r, c });
        } catch (err) {
          console.error('Failed to get initial hint', err);
        }
      } else {
        setSelectedCell(null);
      }
    } catch (e) {
      console.error('Failed to start game', e);
    } finally {
      setLoading(false);
    }
  }, [clearVisualHints]);

  const handleTileClick = async (row: number, col: number) => {
    if (!sessionId || !gameState || gameState.game_over || gameState.is_manual) return;

    // Auto Move Logic
    setVisuals(prev => ({ ...prev, aiHintCell: null }));
    clearVisualHints();

    try {
      const res = await api.makeMove(sessionId, row, col);
      const newState = await api.getState(sessionId);
      const val = newState.grid[row][col].value;
      processMoveResult(res, row, col, val, newState);
    } catch (e) {
      console.error('Auto move failed', e);
    }
  };

  const handleManualSubmit = async (inputVal: number, inputHint: boolean) => {
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
        setVisuals(prev => ({ ...prev, aiHintCell: { r: nr, c: nc } }));
        setSelectedCell({ r: nr, c: nc });
      } else {
        setSelectedCell(null);
        setVisuals(prev => ({ ...prev, aiHintCell: null }));
      }
    } catch (e) {
      console.error('Manual move failed', e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAskAI = async () => {
    if (!sessionId || !gameState || gameState.game_over || aiLoading) return;
    clearVisualHints();
    setAiLoading(true);
    try {
      const hint = await api.getHint(sessionId);
      const [r, c] = hint.recommended_move;
      setVisuals(prev => ({ ...prev, aiHintCell: { r, c } }));
      if (gameMode === 'manual') {
        setSelectedCell({ r, c });
      }
    } catch (e) {
      console.error('AI hint failed', e);
    } finally {
      setAiLoading(false);
    }
  };

  // Autopilot Effect
  useEffect(() => {
    if (!autoPlayActive || !sessionId || !gameState || gameState.game_over || aiLoading || gameMode === 'manual' || gameMode === 'eval') {
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        const hint = await api.getHint(sessionId);
        const [r, c] = hint.recommended_move;
        setVisuals(prev => ({ ...prev, aiHintCell: { r, c } }));
        // Slight delay to see the hint before moving
        setTimeout(() => handleTileClick(r, c), 200);
      } catch (e) {
        setAutoPlayActive(false);
      }
    }, 800);
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayActive, sessionId, gameState, aiLoading, gameMode]);

  return {
    gameState,
    loading,
    aiLoading,
    autoPlayActive,
    setAutoPlayActive,
    visuals,
    selectedCell,
    startNewGame,
    handleTileClick,
    handleManualSubmit,
    handleAskAI
  };
}