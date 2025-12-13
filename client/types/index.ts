export interface CellInfo {
  value: number | null; // null if hidden
  revealed: boolean;
  known: boolean;
}

export interface GameStateResponse {
  grid: CellInfo[][];
  hand: number[];
  current_card: number | null;
  score: number;
  game_over: boolean;
  rows_completed: boolean[];
  cols_completed: boolean[];
  valid_moves: number[][]; // [row, col]
  is_manual: boolean;
}

export interface MoveResponse {
  success: boolean;
  hand_popped: boolean;
  re_hidden: boolean;
  show_hint: boolean;
  game_over: boolean;
  score: number;
}

export interface HintResponse {
  recommended_move: number[]; // [row, col]
  confidence: number;
  all_moves_ranked: { row: number; col: number; q_value: number }[];
}

export const CARD_K = 6;
export const POINTS: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 100 };

export type GameMode = 'auto' | 'manual' | 'eval';

export interface VisualHintState {
  tempRevealed: { r: number; c: number; val: number } | null;
  trapHintCells: number[][];
  aiHintCell: { r: number; c: number } | null;
}