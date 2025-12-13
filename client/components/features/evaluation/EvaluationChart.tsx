import React from 'react';
import { useChartCanvas } from '@/hooks/useChartCanvas';
import { SCORE_GOLD, SCORE_SILVER } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface Props {
  scores: number[];
  isActive: boolean;
}

export const EvaluationChart: React.FC<Props> = ({ scores, isActive }) => {
  const { canvasRef, hoveredData, handleCanvasMouseMove, handleCanvasMouseLeave } = useChartCanvas(scores, isActive);

  return (
    <div className="relative w-full aspect-[9/10] sm:aspect-[2/1] bg-transparent rounded-2xl overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        className="w-full h-full object-contain cursor-crosshair"
        style={{ width: '100%', height: '100%' }}
      />
      {hoveredData && (
        <div
          className="absolute pointer-events-none bg-slate-800/95 backdrop-blur border border-slate-600 text-white text-xs p-2 rounded shadow-xl z-20 flex flex-col items-center min-w-[80px]"
          style={{
            left: hoveredData.x,
            top: hoveredData.y - 60,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="text-slate-400 font-bold uppercase text-[10px]">Game {hoveredData.index + 1}</span>
          <span
            className={cn(
              'text-lg font-bold',
              hoveredData.score >= SCORE_GOLD
                ? 'text-yellow-400'
                : hoveredData.score >= SCORE_SILVER
                ? 'text-slate-200'
                : 'text-blue-300'
            )}
          >
            {hoveredData.score}
          </span>
          <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-600"></div>
        </div>
      )}
    </div>
  );
};