import React from 'react';
import { BookOpen, Eye, EyeOff, X } from 'lucide-react';

interface RulesModalProps {
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl relative flex flex-col gap-0 max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 bg-slate-900 z-10 flex justify-between items-center shrink-0">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="text-emerald-400" /> Game Rules
          </h2>
          <button
            onClick={onClose}
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
              Find the hidden <strong className="text-yellow-400">King (K)</strong> and score as many points as
              possible. You play against a 5x5 grid of hidden cards.
            </p>
          </section>

          <section>
            <h3 className="text-indigo-400 font-bold uppercase tracking-wider text-xs mb-3">Your Deck</h3>
            <p className="text-sm mb-2">
              You start with the lowest card. If your turn ends, you draw the next one.
            </p>
            <div className="flex gap-2 flex-wrap">
              {[1, 1, 1, 1, 1].map((v, i) => (
                <div key={'1-' + i} className="px-2 py-1 bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 rounded text-xs font-bold">1</div>
              ))}
              {[2, 2].map((v, i) => (
                <div key={'2-' + i} className="px-2 py-1 bg-blue-900/50 border border-blue-500/30 text-blue-300 rounded text-xs font-bold">2</div>
              ))}
              {[3, 3].map((v, i) => (
                <div key={'3-' + i} className="px-2 py-1 bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 rounded text-xs font-bold">3</div>
              ))}
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

          {/* ... (Rest of rules content omitted for brevity, keeping structure) ... */}
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
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg"
          >
            Close Rules
          </button>
        </div>
      </div>
    </div>
  );
};