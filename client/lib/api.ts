import { GameStateResponse, MoveResponse, HintResponse } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = {
  createGame: async (manual: boolean = false) => {
    const res = await fetch(`${API_BASE}/game/new?manual=${manual}`, { method: 'POST' });
    return res.json() as Promise<{ session_id: string }>;
  },

  getState: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/game/${sessionId}/state`);
    return res.json() as Promise<GameStateResponse>;
  },

  makeMove: async (sessionId: string, row: number, col: number) => {
    const res = await fetch(`${API_BASE}/game/${sessionId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, col }),
    });
    if (!res.ok) throw new Error('Invalid move');
    return res.json() as Promise<MoveResponse>;
  },

  makeManualMove: async (sessionId: string, row: number, col: number, actual_value: number, has_hint: boolean) => {
    const res = await fetch(`${API_BASE}/game/${sessionId}/manual-input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, col, actual_value, has_hint }),
    });
    if (!res.ok) throw new Error('Invalid manual move');
    return res.json() as Promise<MoveResponse>;
  },

  getHint: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/game/${sessionId}/hint`);
    if (!res.ok) throw new Error('Hint unavailable');
    return res.json() as Promise<HintResponse>;
  }
};