from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import uuid
import torch
import os

# Import Game Logic
from game import GameState
# Import AI Agent Class
from train import RLAgent, device

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Initialize AI ---
print(f"Initializing AI on device: {device}")
ai_agent = RLAgent()
MODEL_PATH = "rl_agent.pth"

if os.path.exists(MODEL_PATH):
    try:
        # Load the trained weights into the policy network
        state_dict = torch.load(MODEL_PATH, map_location=device)
        ai_agent.policy_net.load_state_dict(state_dict)
        ai_agent.policy_net.eval() # Set to evaluation mode
        print(f"Successfully loaded model from {MODEL_PATH}")
    except Exception as e:
        print(f"Error loading model: {e}")
else:
    print(f"WARNING: {MODEL_PATH} not found. AI will play randomly/untrained.")

# --- Game Storage ---
games: Dict[str, GameState] = {}

# --- Pydantic Models ---
class CellState(BaseModel):
    row: int
    col: int
    value: Optional[int]
    is_revealed: bool
    is_known: bool
    is_highlighted: bool

class GameResponse(BaseModel):
    game_id: str
    score: int
    game_over: bool
    rows_completed: List[bool]
    cols_completed: List[bool]
    active_card: Optional[int]
    hand_counts: Dict[str, int]
    grid: List[List[CellState]]
    message: str = ""

class MoveRequest(BaseModel):
    game_id: str
    row: int
    col: int

class HintResponse(BaseModel):
    row: int
    col: int

# --- Helper Functions ---
def format_game_state(game_id: str, game: GameState, message: str = "") -> GameResponse:
    grid_data = []
    for r in range(5):
        row_data = []
        for c in range(5):
            real_val = int(game.grid_values[r][c])
            revealed = bool(game.grid_revealed[r][c])
            known = bool(game.grid_known[r][c])
            highlighted = bool(game.grid_highlights[r][c])

            # Sanitization: Hide unknown values
            visible_value = real_val if (revealed or known) else None

            row_data.append(CellState(
                row=r, col=c,
                value=visible_value,
                is_revealed=revealed,
                is_known=known,
                is_highlighted=highlighted
            ))
        grid_data.append(row_data)

    counts = {str(k): 0 for k in [1, 2, 3, 4, 5, 6]}
    for card in game.hand:
        counts[str(card)] += 1

    active_card = game.hand[0] if game.hand else None

    return GameResponse(
        game_id=game_id,
        score=game.score,
        game_over=game.game_over,
        rows_completed=game.rows_completed,
        cols_completed=game.cols_completed,
        active_card=active_card,
        hand_counts=counts,
        grid=grid_data,
        message=message
    )

# --- Endpoints ---

@app.post("/new-game", response_model=GameResponse)
def new_game():
    game_id = str(uuid.uuid4())
    games[game_id] = GameState()
    return format_game_state(game_id, games[game_id], "New game started.")

@app.post("/move", response_model=GameResponse)
def make_move(req: MoveRequest):
    if req.game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")

    game = games[req.game_id]

    if game.game_over:
        return format_game_state(req.game_id, game, "Game is over.")

    if 0 <= req.row < 5 and 0 <= req.col < 5:
        if game.grid_revealed[req.row][req.col]:
             return format_game_state(req.game_id, game, "Card already revealed.")

        revert_info = game.apply_move((req.row, req.col))

        msg = "Card played."
        if revert_info['hand_popped']:
            if revert_info.get('re_hidden'):
                msg = "Lost! Your card was lower."
            elif revert_info['popped_card'] == 6 and game.score >= 100:
                msg = "King Caught!"
            elif revert_info['popped_card'] == game.grid_values[req.row][req.col]:
                msg = "Draw!"
        else:
            msg = "Win! Keep going."

        if game.game_over:
            msg = "GAME OVER."

        return format_game_state(req.game_id, game, msg)

    raise HTTPException(status_code=400, detail="Invalid coordinates")

@app.get("/hint/{game_id}", response_model=HintResponse)
def get_hint(game_id: str):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")

    game = games[game_id]
    if game.game_over:
        raise HTTPException(status_code=400, detail="Game is over")

    # Use the RLAgent class for inference
    # training=False disables epsilon-greedy random exploration
    best_move, _, _ = ai_agent.select_move(game, training=False)

    if best_move is None:
         raise HTTPException(status_code=400, detail="No moves available")

    return HintResponse(row=best_move[0], col=best_move[1])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)