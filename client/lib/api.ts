import { CatchTheKingEngine } from './game-engine';
import { getHint } from './ai-service';

// In-memory storage to simulate server sessions
const sessions: Record<string, CatchTheKingEngine> = {};

export const api = {
  createGame: async (manual: boolean = false) => {
    // Generate a simple session ID (uses browser crypto API or fallback)
    const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15);

    const game = new CatchTheKingEngine(manual);
    sessions[sessionId] = game;

    // Return a promise to match original API signature
    return Promise.resolve({ session_id: sessionId });
  },

  getState: async (sessionId: string) => {
    const game = sessions[sessionId];
    if (!game) throw new Error('Game session not found');

    return Promise.resolve(game.getGameStateResponse());
  },

  makeMove: async (sessionId: string, row: number, col: number) => {
    const game = sessions[sessionId];
    if (!game) throw new Error('Game session not found');
    if (game.manualMode) throw new Error("Game is in manual mode");
    if (game.gameOver) throw new Error("Game over");

    // Validate coordinates
    if (row < 0 || row >= 5 || col < 0 || col >= 5) throw new Error("Invalid coordinates");

    // Replicate server logic: cannot move to an already revealed cell
    if (game.gridRevealed[row][col]) throw new Error("Captured");

    const result = game.applyMove(row, col);
    return Promise.resolve(result);
  },

  makeManualMove: async (sessionId: string, row: number, col: number, actual_value: number, has_hint: boolean) => {
    const game = sessions[sessionId];
    if (!game) throw new Error('Game session not found');
    if (!game.manualMode) throw new Error("Game is in auto mode");
    if (game.gameOver) throw new Error("Game over");

    if (row < 0 || row >= 5 || col < 0 || col >= 5) throw new Error("Invalid coordinates");
    if (game.gridRevealed[row][col]) throw new Error("Captured");
    if (actual_value < 1 || actual_value > 6) throw new Error("Invalid card value");

    const result = game.applyManualInput(row, col, actual_value, has_hint);
    return Promise.resolve(result);
  },

  getHint: async (sessionId: string) => {
    const game = sessions[sessionId];
    if (!game) throw new Error('Game session not found');

    // getHint is already async because it uses ONNX
    try {
      return await getHint(game);
    } catch (e: any) {
      throw new Error(e.message || 'Hint unavailable');
    }
  }
};