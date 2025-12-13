// src/utils/api.ts
const API_BASE = 'http://localhost:8000';

import { GameStateResponse, MoveResponse, HintResponse } from '@/types';

export const api = {
  createGame: async () => {
    const res = await fetch(`${API_BASE}/game/new`, { method: 'POST' });
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

  getHint: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/game/${sessionId}/hint`);
    if (!res.ok) throw new Error('Hint unavailable');
    return res.json() as Promise<HintResponse>;
  }
};