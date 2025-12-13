// src/types.ts

export interface CellInfo {
  value: number | null;
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
  all_moves_ranked: any[];
}

export interface NewGameResponse {
  session_id: string;
  message: string;
}