import React from 'react';
import { Crown, Skull } from 'lucide-react';
import { cn, getCardColor } from '@/lib/utils';
import { GameMode, GameStateResponse, VisualHintState } from '@/types';

interface Props {
  gameState: GameStateResponse;
  loading: boolean;
  gameMode: GameMode;
  visuals: VisualHintState;
  selectedCell: { r: number; c: number } | null;
  onTileClick: (r: number, c: number) => void;
}

export const GameBoard: React.FC<Props> = ({ gameState, loading, gameMode, visuals, selectedCell, onTileClick }) => {
  if (loading && !gameState) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-400 animate-pulse">
        <div className="w-16 h-16 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
        <p>Initializing...</p>
      </div>
    );
  }

  if (!gameState) return null;

  return (
    <div className="grid grid-cols-5 gap-3 w-full">
      {gameState.grid.map((row, rIndex) =>
        row.map((cell, cIndex) => {
          const isTempRevealed = visuals.tempRevealed?.r === rIndex && visuals.tempRevealed?.c === cIndex;
          const isTrapHint = visuals.trapHintCells.some(([tr, tc]) => tr === rIndex && tc === cIndex);
          const isAiHint = visuals.aiHintCell?.r === rIndex && visuals.aiHintCell?.c === cIndex;
          const isSelected = selectedCell?.r === rIndex && selectedCell?.c === cIndex;
          const isVisible = cell.revealed || isTempRevealed || (gameState.game_over && cell.value !== null);

          let displayContent: React.ReactNode = null;
          if (isVisible) {
            const val = cell.revealed || gameState.game_over ? cell.value : visuals.tempRevealed?.val;
            displayContent = val === 6 ? <Crown size={32} fill="currentColor" /> : val;
          } else if (gameState.game_over && cell.value === null) {
            displayContent = <span className="text-slate-700 text-2xl font-bold">?</span>;
          }

          const isValidMove = gameState.valid_moves.some(([r, c]) => r === rIndex && c === cIndex);
          const isDisabled = gameState.game_over || (gameMode === 'manual' ? true : !isValidMove);

          return (
            <button
              key={`${rIndex}-${cIndex}`}
              onClick={() => onTileClick(rIndex, cIndex)}
              disabled={isDisabled}
              className={cn(
                'relative w-full aspect-square flex items-center justify-center text-xl sm:text-3xl font-bold rounded-xl transition-all duration-300 transform cursor-pointer',
                'shadow-lg border',
                getCardColor(isVisible ? cell.value ?? visuals.tempRevealed?.val ?? null : null),
                gameState.game_over && !cell.revealed && 'opacity-40 grayscale border-dashed',
                gameMode !== 'manual' && !isVisible && isValidMove && !gameState.game_over && 'hover:bg-slate-700 hover:scale-105 hover:border-emerald-500/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]',
                isSelected && 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 z-20 scale-105 bg-slate-700 border-emerald-400',
                isAiHint && !isVisible && !isSelected && 'animate-pulse ring-2 ring-cyan-400/80 ring-offset-2 ring-offset-slate-900 z-10 scale-105',
                isDisabled && !isVisible && !gameState.game_over && !isSelected && 'opacity-30 cursor-not-allowed border-transparent',
                (gameState.rows_completed[rIndex] || gameState.cols_completed[cIndex]) && isVisible && 'brightness-125 ring-2 ring-yellow-500/40'
              )}
            >
              {displayContent !== null ? (
                <span className={cn('drop-shadow-lg filter', displayContent === 6 ? 'text-yellow-400 scale-110' : '')}>
                  {displayContent}
                </span>
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
  );
};