from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
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
    """Load model on startup."""
    load_model()
    yield


app = FastAPI(
    title="Catch the King AI",
    description="API for playing the card game with AI hints",
    lifespan=lifespan
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active game sessions
sessions: dict[str, GameState] = {}

# Load the trained model
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model: Optional[CNNDuelingDQN] = None


def load_model():
    """Load the trained model for AI hints."""
    global model
    try:
        model = CNNDuelingDQN(INPUT_SIZE, OUTPUT_SIZE).to(device)
        model.load_state_dict(torch.load("rl_agent_best_gold.pth", map_location=device, weights_only=True))
        model.eval()
        print("Model loaded successfully")
    except FileNotFoundError:
        print("Warning: No trained model found. AI hints will not be available.")
        model = None


# Pydantic models
class NewGameResponse(BaseModel):
    session_id: str
    message: str


class MoveRequest(BaseModel):
    row: int
    col: int


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


class HintResponse(BaseModel):
    recommended_move: list[int]
    confidence: float
    all_moves_ranked: list[dict]


def get_game_state_response(game: GameState) -> GameStateResponse:
    """Convert game state to API response format."""
    grid = []
    for r in range(5):
        row = []
        for c in range(5):
            # Show value if: Revealed (Perm), Known (Temp), or Game Over
            show_value = (game.grid_revealed[r][c] or
                          game.grid_known[r][c] or
                          game.game_over)

            cell = CellInfo(
                value=int(game.grid_values[r][c]) if show_value else None,
                revealed=bool(game.grid_revealed[r][c]),
                known=bool(game.grid_known[r][c])
            )
            row.append(cell)
        grid.append(row)

    # RELAXED VALIDATION FOR FRONTEND:
    # Allow the UI to enable buttons for any card that is not permanently revealed.
    # This ensures the human player can click "Known" cards if they wish.
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
        valid_moves=valid_moves
    )


@app.post("/game/new", response_model=NewGameResponse)
async def create_new_game():
    """Create a new game session."""
    session_id = str(uuid.uuid4())
    game = GameState()
    game.reset()
    sessions[session_id] = game
    return NewGameResponse(session_id=session_id, message="New game created")


@app.get("/game/{session_id}/state", response_model=GameStateResponse)
async def get_game_state(session_id: str):
    """Get the current state of a game."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    game = sessions[session_id]
    return get_game_state_response(game)


@app.post("/game/{session_id}/move", response_model=MoveResponse)
async def make_move(session_id: str, move: MoveRequest):
    """Make a move in the game."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")

    game = sessions[session_id]

    if game.game_over:
        raise HTTPException(status_code=400, detail="Game is already over")

    if not (0 <= move.row < 5 and 0 <= move.col < 5):
        raise HTTPException(status_code=400, detail="Invalid move coordinates")

    # RELAXED VALIDATION FOR MOVE EXECUTION:
    # Humans can click any cell that isn't permanently revealed.
    # We ignore the strict game mask here to allow clicking "known" cards.
    if game.grid_revealed[move.row][move.col]:
        raise HTTPException(status_code=400, detail="Invalid move - cell already captured")

    # Execute move (Updates game state in place)
    info = game.apply_move((move.row, move.col))

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
    """Get AI recommendation for the next move."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")

    if model is None:
        raise HTTPException(status_code=503, detail="AI model not available")

    game = sessions[session_id]

    if game.game_over:
        raise HTTPException(status_code=400, detail="Game is already over")

    # STRICT VALIDATION FOR AI:
    # Use the internal game logic mask first. This mask likely filters out "Known"
    # cards that are strategically poor to revisit, preventing the AI loop.
    valid_mask = game.get_valid_moves_mask()

    # FALLBACK:
    # If the strict mask says "No moves" (e.g., all remaining cards are Known),
    # but the game isn't over, we fall back to the relaxed mask so the AI
    # can at least suggest the best of the known cards.
    if not np.any(valid_mask):
        valid_mask = np.zeros(25, dtype=bool)
        for r in range(5):
            for c in range(5):
                if not game.grid_revealed[r][c]:
                    valid_mask[r * 5 + c] = True

    if not np.any(valid_mask):
        raise HTTPException(status_code=400, detail="No valid moves available")

    # Get AI prediction
    state = game.get_observation_vector()
    with torch.no_grad():
        state_t = torch.FloatTensor(state).unsqueeze(0).to(device)
        q_values = model(state_t).cpu().numpy()[0]

    # Rank moves based on the calculated valid_mask
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

    if not moves_ranked:
        raise HTTPException(status_code=400, detail="No valid moves found")

    best_move = moves_ranked[0]

    if len(moves_ranked) > 1:
        q_diff = best_move["q_value"] - moves_ranked[1]["q_value"]
        confidence = min(1.0, max(0.0, q_diff / 10.0 + 0.5))
    else:
        confidence = 1.0

    return HintResponse(
        recommended_move=[best_move["row"], best_move["col"]],
        confidence=confidence,
        all_moves_ranked=moves_ranked
    )


@app.delete("/game/{session_id}")
async def delete_game(session_id: str):
    """Delete a game session."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    del sessions[session_id]
    return {"message": "Game session deleted"}


@app.get("/game/{session_id}/card-info")
async def get_card_info(session_id: str):
    """Get information about card values and points."""
    return {
        "card_values": {
            1: {"name": "1", "points": POINTS[1], "count_in_deck": 7},
            2: {"name": "2", "points": POINTS[2], "count_in_deck": 4},
            3: {"name": "3", "points": POINTS[3], "count_in_deck": 5},
            4: {"name": "4", "points": POINTS[4], "count_in_deck": 5},
            5: {"name": "5", "points": POINTS[5], "count_in_deck": 3},
            6: {"name": "King", "points": POINTS[6], "count_in_deck": 1},
        },
        "thresholds": {"silver": SCORE_SILVER, "gold": SCORE_GOLD},
        "rules": {
            "win": "Your card > board card: gain points, keep card",
            "draw": "Your card = board card: gain points, use next card",
            "lose": "Your card < board card: no points, card re-hides, use next card",
            "king": "King can only capture King (100 pts), otherwise game over",
            "five_danger": "If you play a 5 and there's an unrevealed 5 adjacent, you lose your card",
            "hint": "When revealing a card, if a 5 is adjacent, you'll see a hint"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "active_sessions": len(sessions)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)