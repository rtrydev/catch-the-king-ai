'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { GameMode } from '@/types';

// Components
import { Header } from '@/components/features/common/Header';
import { RulesModal } from '@/components/features/common/RulesModal';
import { EvaluationDashboard } from '@/components/features/evaluation/EvaluationDashboard';
import { GameBoard } from '@/components/features/game/GameBoard';
import { ManualInput } from '@/components/features/game/ManualInput';
import { GameSidebar } from '@/components/features/game/GameSidebar';

// Hooks
import { useGameEngine } from '@/hooks/useGameEngine';
import { useEvaluation } from '@/hooks/useEvaluation';

export default function CatchTheKing() {
  const [gameMode, setGameMode] = useState<GameMode>('auto');
  const [showRules, setShowRules] = useState(false);

  // Custom Hooks
  const {
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
  } = useGameEngine(gameMode);

  const {
    evalTarget,
    setEvalTarget,
    evalScores,
    isEvalRunning,
    runEvaluation,
    stopEvaluation
  } = useEvaluation();

  // Mode Switch Effect
  useEffect(() => {
    if (gameMode !== 'eval') {
      startNewGame(gameMode === 'manual');
    }
  }, [gameMode, startNewGame]);

  return (
    <div className="h-dvh bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none z-0 hidden md:block">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 md:p-8 h-full flex flex-col gap-6">
        <Header gameMode={gameMode} setGameMode={setGameMode} />

        {/* --- MAIN CONTENT AREA --- */}
        <div
          className={cn(
            'grid gap-8 transition-all duration-500',
            gameMode === 'eval' ? 'grid-cols-1 max-w-5xl mx-auto w-full' : 'lg:grid-cols-[1fr_350px]'
          )}
        >
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-6">
            {gameMode === 'eval' ? (
              <EvaluationDashboard
                scores={evalScores}
                target={evalTarget}
                setTarget={setEvalTarget}
                isRunning={isEvalRunning}
                onRun={runEvaluation}
                onStop={stopEvaluation}
              />
            ) : (
              // GAME UI
              <>
                <div key="game-ui" className="relative w-full max-w-[600px] mx-auto bg-slate-900/60 backdrop-blur-xl p-4 sm:p-6 rounded-2xl border border-slate-700/50 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                   <GameBoard
                      gameState={gameState!}
                      loading={loading}
                      gameMode={gameMode}
                      visuals={visuals}
                      selectedCell={selectedCell}
                      onTileClick={handleTileClick}
                   />
                </div>

                {gameState && gameState.is_manual && !gameState.game_over && (
                  <ManualInput
                    isVisible={!!selectedCell}
                    onSubmit={handleManualSubmit}
                    isLoading={aiLoading}
                  />
                )}
              </>
            )}
          </div>

          {/* RIGHT COLUMN (Sidebar) */}
          {gameMode !== 'eval' && gameState && (
            <GameSidebar
              gameState={gameState}
              gameMode={gameMode}
              aiLoading={aiLoading}
              autoPlayActive={autoPlayActive}
              onRestart={() => startNewGame(gameMode === 'manual')}
              onAskAI={handleAskAI}
              onToggleAutoPlay={() => setAutoPlayActive(!autoPlayActive)}
              onShowRules={() => setShowRules(true)}
            />
          )}
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}