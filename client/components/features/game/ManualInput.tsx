import React, { useState } from 'react';
import { Check, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onSubmit: (val: number, hint: boolean) => void;
  isLoading: boolean;
  isVisible: boolean;
}

export const ManualInput: React.FC<Props> = ({ onSubmit, isLoading, isVisible }) => {
  const [inputVal, setInputVal] = useState<number | null>(null);
  const [inputHint, setInputHint] = useState(false);

  const handleSubmit = () => {
    if (inputVal !== null) {
      onSubmit(inputVal, inputHint);
      setInputVal(null);
      setInputHint(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className={cn("w-full max-w-[600px] mx-auto transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden animate-in slide-in-from-bottom-4 fade-in")}>
      <div className="bg-slate-900/90 backdrop-blur-xl border border-emerald-500/30 p-6 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.15)] relative">
        <h3 className="text-emerald-300 font-bold mb-4 flex items-center gap-2">
          <Target size={18} /> Select Value
        </h3>
        <div className="grid grid-cols-6 gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <button
              key={v}
              onClick={() => setInputVal(v)}
              className={cn(
                'aspect-square rounded-lg text-lg font-bold border-2 transition-all flex items-center justify-center cursor-pointer',
                inputVal === v
                  ? 'bg-emerald-600 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] scale-110'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:border-slate-500'
              )}
            >
              {v === 6 ? 'K' : v}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setInputHint(!inputHint)}
            className={cn(
              'flex-1 py-3 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer',
              inputHint
                ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            )}
          >
            <div className={cn('w-4 h-4 rounded border flex items-center justify-center', inputHint ? 'bg-cyan-500 border-cyan-500' : 'border-slate-500')}>
              {inputHint && <Check size={10} className="text-black stroke-[4]" />}
            </div>
            Hint
          </button>
          <button
            onClick={handleSubmit}
            disabled={inputVal === null || isLoading}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? 'Wait...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};