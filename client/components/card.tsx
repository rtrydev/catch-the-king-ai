import React from 'react';
import { HelpCircle, Crown, Eye, Sparkles } from 'lucide-react'; // Added Sparkles
import { clsx } from 'clsx';

type CardProps = {
  value: number | null;
  isRevealed: boolean;
  isKnown: boolean;
  isHighlighted: boolean;
  isHint: boolean; // <--- NEW PROP
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const Card: React.FC<CardProps> = ({
  value, isRevealed, isKnown, isHighlighted, isHint, onClick, disabled = false, size = 'md'
}) => {

  const getCardColor = (val: number | null) => {
    if (val === null) return 'bg-slate-700 border-slate-600';
    switch (val) {
      case 1: return 'bg-emerald-600 border-emerald-400 text-emerald-100';
      case 2: return 'bg-amber-600 border-amber-400 text-amber-100';
      case 3: return 'bg-yellow-500 border-yellow-300 text-yellow-900';
      case 4: return 'bg-purple-600 border-purple-400 text-purple-100';
      case 5: return 'bg-blue-600 border-blue-400 text-blue-100';
      case 6: return 'bg-red-700 border-red-500 text-red-100';
      default: return 'bg-slate-700';
    }
  };

  const baseClasses = "relative flex items-center justify-center rounded-lg border-b-4 transition-all duration-100 select-none shadow-md";
  const sizeClasses = {
    sm: "w-10 h-12 text-sm",
    md: "w-16 h-20 text-xl font-bold",
    lg: "w-24 h-32 text-3xl font-bold"
  };

  const cursorClass = disabled || isRevealed ? "cursor-default" : "cursor-pointer active:translate-y-1 active:border-b-0";

  // Highlight Priorities:
  // 1. Hint (Cyan pulse)
  // 2. Trap Warning (Yellow pulse)
  let borderEffects = "";
  if (isHint && !isRevealed) {
    borderEffects = "ring-4 ring-cyan-400 animate-pulse z-20 shadow-[0_0_15px_rgba(34,211,238,0.6)]";
  } else if (isHighlighted && !isRevealed) {
    borderEffects = "ring-4 ring-yellow-400 animate-pulse z-10";
  }

  let content = null;
  let bgClass = getCardColor(value);

  if (isRevealed) {
    content = value === 6 ? <Crown size={32} /> : value;
  } else if (isKnown && value !== null) {
    bgClass = "bg-slate-800 border-slate-700 opacity-90";
    content = (
      <div className="flex flex-col items-center opacity-50">
        <Eye size={16} className="mb-1" />
        <span className="text-sm">{value === 6 ? 'K' : value}</span>
      </div>
    );
  } else {
    content = (
      <div className="opacity-20 relative">
        <HelpCircle size={20} />
      </div>
    );
  }

  return (
    <div
      onClick={!disabled && !isRevealed ? onClick : undefined}
      className={clsx(
        baseClasses,
        sizeClasses[size],
        bgClass,
        cursorClass,
        borderEffects
      )}
    >
      {content}
      {/* Show small icon for hint */}
      {isHint && !isRevealed && (
        <div className="absolute -top-2 -right-2 bg-cyan-500 text-black rounded-full p-1 shadow-lg animate-bounce">
          <Sparkles size={12} />
        </div>
      )}
    </div>
  );
};

export default Card;