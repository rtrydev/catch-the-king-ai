from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid
import torch
import numpy as np

from game import GameState, POINTS, CARD_K, SCORE_GOLD, SCORE_SILVER
from train import CNNDuelingDQN, INPUT_SIZE, OUTPUT_SIZE

@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield

app = FastAPI(title="Catch the King AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, GameState] = {}
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model: Optional[CNNDuelingDQN] = None

def load_model():
    global model
    try:
        model = CNNDuelingDQN(INPUT_SIZE, OUTPUT_SIZE).to(device)
        model.load_state_dict(torch.load("rl_agent_best_gold.pth", map_location=device, weights_only=True))
        model.eval()
        print("Model loaded successfully")
    except FileNotFoundError:
        print("Warning: No trained model found.")
        model = None

class NewGameResponse(BaseModel):
    session_id: str
    message: str

class MoveRequest(BaseModel):
    row: int
    col: int

class ManualMoveRequest(BaseModel):
    row: int
    col: int
    actual_value: int
    has_hint: bool

class MoveResponse(BaseModel):
    success: bool
    hand_popped: bool
    re_hidden: bool
    show_hint: bool
    game_over: bool
    score: int

class CellInfo(BaseModel):
    value: Optional[int]
    revealed: bool
    known: bool

class GameStateResponse(BaseModel):
    grid: list[list[CellInfo]]
    hand: list[int]
    current_card: Optional[int]
    score: int
    game_over: bool
    rows_completed: list[bool]
    cols_completed: list[bool]
    valid_moves: list[list[int]]
    is_manual: bool
    diag_main_completed: bool
    diag_anti_completed: bool

class HintResponse(BaseModel):
    recommended_move: list[int]
    confidence: float
    all_moves_ranked: list[dict]

def get_game_state_response(game: GameState) -> GameStateResponse:
    grid = []
    for r in range(5):
        row = []
        for c in range(5):
            # VISIBILITY LOGIC:
            # 1. Always show if Revealed or Known (temporarily visible).
            show_value = game.grid_revealed[r][c] or game.grid_known[r][c]

            # 2. Game Over handling:
            # - Auto Mode: Reveal everything (show_value = True).
            # - Manual Mode: We CANNOT reveal everything because we don't know the values.
            #   So we only show what was already discovered.
            if game.game_over and not game.manual_mode:
                show_value = True

            val = int(game.grid_values[r][c]) if show_value else None

            # In manual mode, an unvisited cell has value 0 in the backend.
            # If for some reason show_value is true but val is 0, send None.
            if val == 0:
                val = None

            cell = CellInfo(
                value=val,
                revealed=bool(game.grid_revealed[r][c]),
                known=bool(game.grid_known[r][c])
            )
            row.append(cell)
        grid.append(row)

    valid_moves = []
    if not game.game_over:
        for r in range(5):
            for c in range(5):
                if not game.grid_revealed[r][c]:
                    valid_moves.append([r, c])

    return GameStateResponse(
        grid=grid,
        hand=game.hand.copy(),
        current_card=game.hand[0] if game.hand else None,
        score=game.score,
        game_over=game.game_over,
        rows_completed=game.rows_completed.copy(),
        cols_completed=game.cols_completed.copy(),
        valid_moves=valid_moves,
        is_manual=game.manual_mode,
        diag_main_completed=game.diag1_completed,
        diag_anti_completed=game.diag2_completed
    )

@app.post("/game/new", response_model=NewGameResponse)
async def create_new_game(manual: bool = False):
    session_id = str(uuid.uuid4())
    game = GameState()
    game.reset(manual_mode=manual)
    sessions[session_id] = game
    return NewGameResponse(session_id=session_id, message="New game created")

@app.get("/game/{session_id}/state", response_model=GameStateResponse)
async def get_game_state(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    game = sessions[session_id]
    return get_game_state_response(game)

@app.post("/game/{session_id}/move", response_model=MoveResponse)
async def make_move(session_id: str, move: MoveRequest):
    if session_id not in sessions: raise HTTPException(404)
    game = sessions[session_id]
    if game.manual_mode: raise HTTPException(400, "Game is in manual mode")
    if game.game_over: raise HTTPException(400, "Game over")
    if not (0 <= move.row < 5 and 0 <= move.col < 5): raise HTTPException(400)
    if game.grid_revealed[move.row][move.col]: raise HTTPException(400, "Captured")

    info = game.apply_move((move.row, move.col))
    return MoveResponse(
        success=True,
        hand_popped=info['hand_popped'],
        re_hidden=info['re_hidden'],
        show_hint=info['show_hint'],
        game_over=game.game_over,
        score=game.score
    )

@app.post("/game/{session_id}/manual-input", response_model=MoveResponse)
async def make_manual_move(session_id: str, move: ManualMoveRequest):
    if session_id not in sessions: raise HTTPException(404)
    game = sessions[session_id]
    if not game.manual_mode: raise HTTPException(400, "Game is in auto mode")
    if game.game_over: raise HTTPException(400, "Game over")
    if not (0 <= move.row < 5 and 0 <= move.col < 5): raise HTTPException(400)
    if game.grid_revealed[move.row][move.col]: raise HTTPException(400, "Captured")
    if move.actual_value < 1 or move.actual_value > 6: raise HTTPException(400, "Invalid card")

    info = game.apply_manual_input((move.row, move.col), move.actual_value, move.has_hint)

    return MoveResponse(
        success=True,
        hand_popped=info['hand_popped'],
        re_hidden=info['re_hidden'],
        show_hint=info['show_hint'],
        game_over=game.game_over,
        score=game.score
    )

@app.get("/game/{session_id}/hint", response_model=HintResponse)
async def get_hint(session_id: str):
    if session_id not in sessions: raise HTTPException(404)
    if model is None: raise HTTPException(503)
    game = sessions[session_id]
    if game.game_over: raise HTTPException(400)

    valid_mask = game.get_valid_moves_mask()

    if not np.any(valid_mask):
        valid_mask = np.zeros(25, dtype=bool)
        for r in range(5):
            for c in range(5):
                if not game.grid_revealed[r][c]:
                    valid_mask[r * 5 + c] = True

    if not np.any(valid_mask): raise HTTPException(400, "No valid moves")

    state = game.get_observation_vector()
    with torch.no_grad():
        state_t = torch.FloatTensor(state).unsqueeze(0).to(device)
        q_values = model(state_t).cpu().numpy()[0]

    moves_ranked = []
    for i in range(25):
        if valid_mask[i]:
            r, c = divmod(i, 5)
            moves_ranked.append({
                "row": r,
                "col": c,
                "q_value": float(q_values[i])
            })

    moves_ranked.sort(key=lambda x: x["q_value"], reverse=True)
    if not moves_ranked: raise HTTPException(400, "No moves")

    best_move = moves_ranked[0]
    confidence = 1.0
    if len(moves_ranked) > 1:
        q_diff = best_move["q_value"] - moves_ranked[1]["q_value"]
        confidence = min(1.0, max(0.0, q_diff / 10.0 + 0.5))

    return HintResponse(
        recommended_move=[best_move["row"], best_move["col"]],
        confidence=confidence,
        all_moves_ranked=moves_ranked
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)