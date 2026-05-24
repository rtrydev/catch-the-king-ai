# Catch the King AI — Project Guide

A Deep-Q-Network agent that plays the card game **Catch the King**, plus a Next.js web client that runs the same model in the browser via ONNX. Backend in Python (PyTorch + FastAPI), frontend in TypeScript (Next 16 / React 19 / `onnxruntime-web`).

## Repo layout

```
game.py              GameState — rules engine + observation builder
train.py             CNNDuelingDQN model + Double-DQN training loop
server.py            FastAPI inference server (loads .pth, serves hints)
export_model.py      Converts a .pth checkpoint to model.onnx
rules.txt            Plain-English game rules
checkpoints/         Saved weights (best_avg, best_gold, final)
client/              Next.js web app — also runs the model client-side via ONNX
venv/                Python venv (Python 3.13, torch+cu128)
```

**Checkpoint path gotcha.** `train.py` writes `rl_agent_*.pth` to the **current working directory**; `server.py` and `export_model.py` *load* from the CWD as well — but the canonical copies live in `checkpoints/`. You either run those scripts from inside `checkpoints/` or copy/symlink the .pth file into the repo root before running them. Don't "fix" this by editing paths without checking whether training is mid-run.

## How to run things

```powershell
# All commands assume venv is activated, or use venv\Scripts\python.exe directly
venv\Scripts\python.exe train.py          # Train from scratch (~100k episodes)
venv\Scripts\python.exe server.py         # FastAPI on :8000
venv\Scripts\python.exe export_model.py   # Produce model.onnx for the client
cd client && npm install && npm run dev   # Web client on :3000
```

The client's `public/model.onnx` is the bundled in-browser model. The Python server is only needed for the `/game/{id}/hint` endpoint that returns ranked Q-values from the live PyTorch model — the client can play standalone using ONNX.

---

## The game

A 5×5 board of 25 face-down cards. The player has a hand of 12 cards and tries to score 400+ (silver) or 550+ (gold) before the hand runs out or a fatal mistake ends the game.

### Card distributions

| Card | On board | In hand | Point value |
|------|----------|---------|-------------|
| [1]  | 7        | 5       | 10          |
| [2]  | 4        | 2       | 20          |
| [3]  | 5        | 2       | 30          |
| [4]  | 5        | 1       | 40          |
| [5]  | 3        | 1       | 50          |
| [K]  | 1        | 1       | 100         |
| **Total** | **25** | **12** | — |

Internally the [K]ing is encoded as **value 6** (see `CARD_K = 6`, `POINTS[6] = 100`). When reading the code, "card 6" means King.

You always play the **lowest card in hand** (`hand[0]`). When a card leaves your hand, the next-lowest is up next. The hand is ordered `[1,1,1,1,1, 2,2, 3,3, 4, 5, K]`.

### What happens when you click a face-down cell

Let `P` = your current hand card, `B` = the value of the clicked cell. `info['show_hint']` is reported alongside every outcome: if any of the 8 neighbors of the clicked cell holds a [5] (revealed *or* not), the 8 neighbors are temporarily highlighted ("hint"). The hint then disappears — careful players can triangulate where the [5] is.

In `apply_move` the branches are checked in this order:

1. **Suicide on a known cell:** if the cell is already `known` and `P < B` (and it isn't the K-vs-K edge), the hand pops, the cell stays face-down, turn ends. Returns immediately.
2. **Capture by [5]:** if `P == 5` AND a non-revealed neighbor holds [5] → your [5] is **captured** (no points, hand pops, cell becomes `known` but not revealed, turn ends). The captured-by-revealed-[5] case is not a capture — a revealed [5] still triggers `show_hint` but doesn't take your card.
3. **King logic:** if `P == K`:
   - Revealing K → **+100 points**, K leaves your hand, cell revealed.
   - Revealing anything else → cell revealed and **game over** (you "shot" the wrong cell).
4. **Number-vs-number comparison** (the common case):
   - `P > B` → **+POINTS[B]**, cell stays revealed, **you keep your card** (free extra move).
   - `P == B` → **+POINTS[B]**, cell stays revealed, hand pops.
   - `P < B` → **no points**, cell is **re-hidden** but stays `known` (a cautious player remembers what was there), hand pops.
5. **Line bonuses** (only when the cell ended up revealed): completing a full **row**, **column**, or either **diagonal** for the first time → **+10**. The diagonal bonuses are implemented in code but not mentioned in `rules.txt`; treat the code as authoritative.

Game ends when the hand is empty, K is played onto a non-K cell, or every cell has been revealed.

---

## `game.py` — `GameState`

### State

| Field | Type | Meaning |
|---|---|---|
| `grid_values` | `5×5 int` | The actual cards. In **manual mode**, 0 until the user enters it. |
| `grid_revealed` | `5×5 bool` | Permanently uncovered (left visible after a successful click). |
| `grid_known` | `5×5 bool` | "We saw it once." Set when a duel was lost and the cell re-hid, or when the player got captured by a neighbor [5], or when the cell is currently revealed. Survives re-hides. |
| `hand` | `list[int]` | Cards left, lowest first. |
| `score`, `game_over` | | |
| `rows_completed`, `cols_completed`, `diag1_completed`, `diag2_completed` | | Latch so each bonus pays once. |
| `manual_mode` | `bool` | If true, board is unknown to the engine; user supplies `(actual_value, has_hint)` on each move. |

`revealed` vs `known`: **revealed** means the cell stays face-up (a successful claim); **known** means the engine has the value but the cell may be face-down again (re-hidden after a lost duel). Both contribute to the observation. A move's legality treats them differently — see `get_valid_moves_mask`.

### Two execution paths

- **Auto mode** (`apply_move`) — used in training, evaluation, and the auto-play web mode. The engine knows the whole board; it just runs the rules.
- **Manual mode** (`apply_manual_input(coords, actual_value, has_hint)`) — used when a human is playing a real-world game and asking for hints. The engine has no truth; the user reports outcomes. `has_hint=True` while playing a [5] is treated as proof of capture (simplification — real-game distinction between "hint due to a non-clicked 5 neighbor" and "captured" is collapsed).

### `_compute_triangulation` — the [5]-locator

The danger map is the smartest part of `game.py`. Each revealed/known cell is either a **hint source** (had a [5] neighbor → hint appeared) or a **no-hint source** (didn't). From these:

1. Every neighbor of a **no-hint source** is `definitely_not_5`.
2. For each **hint source**, the unrevealed neighbors that are not yet ruled out become a "constrained region" — at least one of them is the [5].
3. `high_prob_5[r][c]` = (# regions containing this cell) / (max appearance count). If a constrained region narrows to one candidate, that cell goes to 1.0.

This drives Channel 2 of the observation, and is what lets the agent stop blundering into face-down [5]s once the board has been partially explored. In **manual mode**, hint sources are taken from `manual_hints` (user-reported); in auto mode they're derived from `grid_values`.

### `get_observation_vector()` — 157-d vector fed to the network

- **6 channels × 5 × 5 = 150** (flattened in row-major order):

  | Channel | Name | Per-cell value |
  |---|---|---|
  | 0 | Board state | `-1` if hidden, `0` if revealed, `value/6` if known but not currently revealed |
  | 1 | Win probability | For unknown cells: base rate `wins_in_deck / total_unknown` for current hand card. For known cells: 1 if `P` beats `B` (or `P==K` matches `K`), else 0. |
  | 2 | Danger (prob of [5]) | For unknown cells: `base_prob_5 = min(1, remaining_5s / num_potential_cells)` where `num_potential_cells` excludes `definitely_not_5`. If the cell sits in a `_compute_triangulation` constrained region, take `max(base_prob_5, high_prob_5[r][c])`. For known cells: 1 if `B == 5`, else 0. Revealed cells: 0. |
  | 3 | King probability | `1/total_unknown` for unknowns when K still in deck; 1 for known-K cells |
  | 4 | Hint source | 1 if this revealed/known cell triggered a hint |
  | 5 | Definitely NOT [5] | 1 if ruled out |

- **7 scalars** appended after the flattened grid:
  - `hand[0] / 6` (current card, normalized)
  - Remaining count for each of cards 1..6, each divided by 25

`INPUT_SIZE = 157` and `OUTPUT_SIZE = 25` (one Q-value per cell).

### `get_valid_moves_mask` — action legality

Returns a 25-bool mask. Key cases:

- A revealed cell is never valid.
- **Unknown cells are always valid**, regardless of the active card. This includes K — when K is in hand, the agent may guess on any unknown cell.
- Among **known** cells: when `P == K`, only the cell whose `B == K` is valid (all other known cells are masked out). When `P != K`, a known cell with `B > P` is **suicide-invalid** *unless* no unknown cells remain, in which case it's allowed as a forced last move; known cells with `B <= P` are always valid.
- Fallback: if the mask ends up all-false (degenerate state), any non-revealed cell is allowed.

Note that the hand is fixed-order `[1,1,1,1,1, 2,2, 3,3, 4, 5, K]`, so K only becomes the active card after the other 11 are spent. The mask doesn't *force* the agent to locate K beforehand — it can always guess on an unknown cell — but in practice the agent has to learn K's location during play of the earlier cards, because there are no "extra turns left" once K is up.

### `step(action)` — RL transition + reward shaping

Only valid in auto mode. Returns `(next_obs, reward, done)`. Total reward = `(score_delta) + step_reward`, where `step_reward` is shaped. The branches are checked in this order — only the first matching branch fires:

| Situation | Reward |
|---|---|
| Action on already-revealed cell (early return, no `apply_move` call) | −50 |
| Suicide: clicked a known cell where `B > P` (re-hidden) | −50 |
| Played [5], got captured by neighbor [5] (re-hidden, captured branch) | −15 |
| Re-hidden after a lost duel where the cell was previously unknown (info gained) | +5 |
| Re-hidden on a known cell that wasn't caught by the suicide branch above | −30 |
| K played correctly (hand popped, `P == K`) | +50 |
| Hand popped on [5] (P==5 vs B==5) or on a previously-unknown cell | +5 |
| Hand popped on a known cell (P==B match on a cell we'd already seen) | −40 |
| Successful "free extra turn" (`P > B`) — neither hand popped nor re-hidden | +15 |
| Override: K just played and `game_over` with `score < 100` (K played onto the wrong cell) | −100 |

The −40 branch is **not** a loss outcome — it's a successful tie (P==B) that scored points, penalized as a shaping signal for "spent a card on a known cell instead of finding a free-extra-turn opportunity elsewhere."

The −100 override fires only when `player_card == CARD_K` AND `game_over` AND `score < 100` — i.e. K was just played onto a non-K cell, ending the game. It overwrites the +50 / −15 / etc. branches that might otherwise have fired this step. It does **not** fire on game-over from running out of hand cards.

These exist purely to shape learning; they don't affect the actual game score.

---

## `train.py` — model + training loop

### `CNNDuelingDQN`

```
input (157,) = flat 6×5×5 grid  ++  7 scalars
   |
   split: board_part [:150] reshaped to (6,5,5), scalar_part [150:]
   |
Conv2d(6 → 64, 3×3, pad=1) → ReLU
Conv2d(64 → 128, 3×3, pad=1) → ReLU
Flatten  →  (3200,)
   |
   concat with scalar_part  →  (3207,)
   |
Linear(3207 → 512) → ReLU → Dropout(0.1)
   |
   ┌── Value stream:     Linear(512→128) → ReLU → Linear(128→1)
   └── Advantage stream: Linear(512→128) → ReLU → Linear(128→25)
       Q = V + (A − mean(A))                                  # Dueling combine
```

Output: 25 Q-values, one per cell. Masking happens outside the network — invalid actions get `−inf` before `argmax`.

### Training algorithm

- **Double DQN**: policy net picks the action on `next_state`, target net evaluates it. Reduces overestimation bias.
- **Dueling heads** (above).
- **Prioritized Experience Replay** (`PrioritizedReplayBuffer`): sampling probability ∝ `|TD-error|^α`, with importance-sampling weights `(N·P)^(-β)` and `β` annealed `0.4 → 1.0`. There's also a `UniformReplayBuffer` fallback (toggle `USE_PER`).
- **Soft target updates** (Polyak): `target = τ·policy + (1-τ)·target` every step, `τ=0.005`.
- **Staged ε-greedy** (`get_epsilon`):
  - Phase 1 (0 → 50k steps): `1.0 → 0.3` (heavy exploration)
  - Phase 2 (50k → 150k): `0.3 → 0.1`
  - Phase 3 (150k → 350k): `0.1 → 0.02`
  - After: pinned at `0.02`
  - Note: `steps_done` counts *environment steps*, not episodes. With ~15-step games, 100k episodes ≈ 1.5M steps — Phase 3 finishes early.
- **Optimizer**: Adam, `lr=5e-5`, `StepLR(step=15000 episodes, γ=0.5)`. The scheduler only steps once the replay buffer is past `MIN_MEMORY` — important when adjusting `MIN_MEMORY` so LR doesn't decay during pure exploration.
- **Loss**: SmoothL1 (Huber), weighted by IS weights.
- **Grad clip**: 0.5 (`GRAD_CLIP`).
- **Batch**: 64, gamma 0.97.
- **Episodes**: 100k. Eval every 1000 episodes (last-1000-rolling stats); deep eval (5000 games) every 5000 episodes.

### Hyperparameter block (top of `train.py`)

All training knobs are constants in one block at the top of the file — `NUM_EPISODES`, `BATCH_SIZE`, `LR`, `GAMMA`, `MEMORY_SIZE`, `USE_PER`, `USE_SOFT_UPDATE`, `TAU`, the epsilon phase boundaries, etc. Change them there, not scattered.

### Checkpoints written

- `rl_agent_best_avg.pth` — best eval-average so far
- `rl_agent_best_gold.pth` — best eval gold-rate so far (this is what `server.py` and `export_model.py` load)
- `rl_agent_final.pth` — last-episode snapshot

---

## `server.py` — FastAPI inference

Lifespan loads `rl_agent_best_gold.pth` into a `CNNDuelingDQN` on CUDA (falls back to CPU). Sessions are kept in an in-process dict keyed by UUID — there is **no persistence**; restarting the server loses all in-flight games.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/game/new?manual={bool}` | Create a session, return `session_id`. |
| `GET`  | `/game/{id}/state` | Full visible state for the client (cell-by-cell visibility, valid moves, completion flags). |
| `POST` | `/game/{id}/move` | Execute an auto-mode move (engine knows the board). |
| `POST` | `/game/{id}/manual-input` | Execute a manual-mode move (client tells engine the actual value + whether a hint appeared). |
| `GET`  | `/game/{id}/hint` | Run the model on the current observation and return ranked Q-values per valid cell. |

CORS is wide open (`allow_origins=["*"]`) — fine for dev, would need tightening for prod.

The visibility rule in `get_game_state_response` is important: on game-over in auto mode it reveals everything; in manual mode it only reveals what was already known (because the engine doesn't know the rest).

---

## `export_model.py` and the client

`export_model.py` loads `rl_agent_best_gold.pth`, runs `torch.onnx.export` with `dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}`, writes to `temp_model.onnx`, then re-saves through `onnx.load`/`onnx.save` as `model.onnx` (weights inlined by default). The client picks that up from `client/public/model.onnx` and runs it via `onnxruntime-web` (`client/lib/ai-service.ts`) — so the web app can give hints with no Python server running. The server is still used for game-state management; the ONNX model is only the *inference* side.

When you re-train and want the client to use new weights:

1. Copy/symlink the new `.pth` to repo root if it isn't there.
2. `python export_model.py`
3. Copy `model.onnx` to `client/public/model.onnx` (the script currently writes to the repo root, not `client/public/` — manual step).

---

## Conventions and gotchas

- **K is value 6 in code** but value `K` (or 100 points) in rules-speak. Don't confuse `CARD_K` with literal 6 when reading `POINTS` lookups.
- **Hand order matters**: `hand[0]` is the active card. Use `hand.pop(0)`, never index further.
- **`known` ≠ `revealed`**: a cell can be known (we saw the value once) without being revealed (it's face-down again). The observation distinguishes them; legality checks treat known-but-stronger as suicide-invalid.
- **Manual-mode capture is approximated**: `apply_manual_input` treats "user said `has_hint=True` while playing a [5]" as proof of capture. The real game only captures if a *face-down* neighbor is the [5] — a hint triggered by an already-revealed [5] is not a capture. (Auto-mode's `info['show_hint']` has the same conflation in the *reporting* direction: `apply_move` sets `show_hint=True` for any [5] neighbor, revealed or not.) This simplification can over-trigger captures when the player is playing carefully near revealed [5]s.
- **Diagonal bonuses are in code, not in `rules.txt`**: `diag1_completed` (TL→BR) and `diag2_completed` (BL→TR) both award +10 the first time the diagonal is fully revealed.
- **Rewards are not the score.** `step()` returns shaped reward (score-delta + bonus terms); `env.score` is what the game actually tracks. Don't accidentally log one when you meant the other.
- **K is always the last card in hand**: the fixed hand order means `hand[0] == K` only after all 11 other cards are spent. The agent can't "explore with other cards first" *after* K becomes active — exploration has to happen earlier. Locating K is what the danger/king-probability channels and the suicide-invalid masking are nudging toward during the rest of the hand.
- **GPU is optional**: `device` is set in both `train.py` and `server.py` from `torch.cuda.is_available()`. The repo is configured for `torch==2.9.1+cu128` (see `requirements.txt`); on a CPU-only machine it still works, just slower.
