import { useState, useRef } from 'react';
import { api } from '@/lib/api';

export function useEvaluation() {
  const [evalTarget, setEvalTarget] = useState<number>(100);
  const [evalScores, setEvalScores] = useState<number[]>([]);
  const [isEvalRunning, setIsEvalRunning] = useState(false);
  const stopEvalRef = useRef(false);

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
      } catch (err) {
        console.error('Eval error', err);
      }
      // Brief pause to allow UI update
      if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    setIsEvalRunning(false);
  };

  const stopEvaluation = () => {
    stopEvalRef.current = true;
  };

  return {
    evalTarget,
    setEvalTarget,
    evalScores,
    isEvalRunning,
    runEvaluation,
    stopEvaluation
  };
}