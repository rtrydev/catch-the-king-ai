import numpy as np
import random

# --- Game Configuration ---
SCORE_GOLD = 550
SCORE_SILVER = 400

CARD_1 = 1
CARD_2 = 2
CARD_3 = 3
CARD_4 = 4
CARD_5 = 5
CARD_K = 6

POINTS = {
    CARD_1: 10, CARD_2: 20, CARD_3: 30,
    CARD_4: 40, CARD_5: 50, CARD_K: 100
}

# Input Size Calculation:
# Board (25 * 8) + Highlights (25) + Hand OneHot (6) + Hand Counts (6) + Remaining Deck (6)
# 200 + 25 + 6 + 6 + 6 = 243
INPUT_SIZE = 243
OUTPUT_SIZE = 25

class GameState:
    def __init__(self):
        self.reset()

    def reset(self):
        # 1. Setup Board
        # Deck Definition: 7x1, 4x2, 5x3, 5x4, 3x5, 1xK (Total 25)
        self.full_deck_counts = {1:7, 2:4, 3:5, 4:5, 5:3, 6:1}
        board_deck = []
        for card, count in self.full_deck_counts.items():
            board_deck.extend([card] * count)

        random.shuffle(board_deck)
        self.grid_values = np.array(board_deck).reshape(5, 5)
        self.grid_revealed = np.full((5, 5), False, dtype=bool)
        self.grid_known = np.full((5, 5), False, dtype=bool)
        self.grid_highlights = np.full((5, 5), False, dtype=bool)

        # 2. Setup Hand
        self.hand = ([CARD_1]*5 + [CARD_2]*2 + [CARD_3]*2 +
                     [CARD_4]*1 + [CARD_5]*1 + [CARD_K]*1)

        self.score = 0
        self.game_over = False
        self.rows_completed = [False] * 5
        self.cols_completed = [False] * 5

        return self.get_observation_vector()

    def get_valid_moves_mask(self):
        """
        Heuristic Improvement:
        Masks not only revealed cards, but KNOWN cards that would result
        in a guaranteed loss/waste. This drastically speeds up training.
        """
        mask = np.zeros(25, dtype=bool)
        if self.game_over: return mask

        flat_revealed = self.grid_revealed.flatten()
        flat_known = self.grid_known.flatten()
        flat_values = self.grid_values.flatten()

        current_card = self.hand[0] if self.hand else 0

        for i in range(25):
            # 1. Cannot play on face-up cards
            if flat_revealed[i]:
                mask[i] = False
                continue

            # 2. HEURISTIC: Don't play on KNOWN losers
            if flat_known[i]:
                board_val = flat_values[i]

                # If we have King, we only want to hit King (Win) or Unknowns.
                # Hitting a known 1-5 with a King is a valid move, but usually suboptimal
                # compared to finding the other King. However, we'll allow it if it scores points.
                # But strict logic: King vs Non-King = Win, but card stays.
                # King vs King = Win + 100 + Pop.

                # Logic: If I play a card <= board_card (and not K vs K), I lose the card.
                # Since I KNOW this will happen, don't do it.
                if current_card == CARD_K:
                    if board_val == CARD_K:
                        mask[i] = True # King vs King is great
                    else:
                        # King vs small card is a win, but we might want to save King?
                        # For now, allow it, as it gains points.
                        mask[i] = True
                elif current_card <= board_val:
                    # Guaranteed Loss (or Draw which pops card).
                    # Don't suicide on known cards.
                    mask[i] = False
                else:
                    # current > board (Win), valid move on known card
                    mask[i] = True
            else:
                # Unknown card - always valid to explore
                mask[i] = True

        # Fallback: If heuristic blocked EVERYTHING (rare), allow all unrevealed
        if not np.any(mask):
            for i in range(25):
                if not flat_revealed[i]: mask[i] = True

        return mask

    def get_observation_vector(self):
        obs = []

        # 1. Board (25x8) -> [IsUnknown, 1, 2, 3, 4, 5, K, IsRevealed]
        # We will use this in the CNN
        for r in range(5):
            for c in range(5):
                cell_vec = [0.0] * 8
                val = self.grid_values[r][c]
                if self.grid_revealed[r][c]:
                    cell_vec[val] = 1.0; cell_vec[7] = 1.0
                elif self.grid_known[r][c]:
                    cell_vec[val] = 1.0; cell_vec[7] = 0.0 # Known but hidden
                else:
                    cell_vec[0] = 1.0; cell_vec[7] = 0.0
                obs.extend(cell_vec)

        # 2. Highlights (25)
        # Spatial feature (CNN will use this)
        obs.extend(self.grid_highlights.flatten().astype(np.float32))

        # --- SCALAR FEATURES START HERE (Index 225+) ---

        # 3. Current Card One-Hot (6)
        current_card_vec = [0.0] * 6
        if self.hand:
            current_card_vec[self.hand[0] - 1] = 1.0
        obs.extend(current_card_vec)

        # 4. Hand Counts Normalized (6)
        counts = [0] * 6
        for card in self.hand: counts[card - 1] += 1
        obs.extend([c / 5.0 for c in counts])

        # 5. NEW: Remaining Unknown Deck Counts (6)
        # This helps the AI calculate probability (e.g. "No Kings left")
        current_board_counts = self.full_deck_counts.copy()
        for r in range(5):
            for c in range(5):
                if self.grid_revealed[r][c] or self.grid_known[r][c]:
                    val = self.grid_values[r][c]
                    current_board_counts[val] = max(0, current_board_counts[val] - 1)

        obs.extend([current_board_counts[k] / 25.0 for k in sorted(current_board_counts.keys())])

        return np.array(obs, dtype=np.float32)

    def _get_neighbors(self, r, c):
        neighbors = []
        r_min, r_max = max(0, r-1), min(4, r+1)
        c_min, c_max = max(0, c-1), min(4, c+1)
        for nr in range(r_min, r_max + 1):
            for nc in range(c_min, c_max + 1):
                if nr == r and nc == c: continue
                neighbors.append((nr, nc))
        return neighbors

    def step(self, action_idx):
        if self.game_over: return self.get_observation_vector(), 0, True

        r, c = divmod(action_idx, 5)

        # Invalid move check (Already revealed)
        if self.grid_revealed[r][c]:
            return self.get_observation_vector(), -50, self.game_over

        prev_score = self.score
        player_card = self.hand[0]
        board_card = self.grid_values[r][c]

        # Suicide check (Redundant with mask, but good for safety)
        if self.grid_known[r][c] and player_card <= board_card:
            if not (player_card == CARD_K and board_card == CARD_K):
                self.hand.pop(0)
                if not self.hand: self.game_over = True
                return self.get_observation_vector(), -100, self.game_over

        neighbors = self._get_neighbors(r, c)
        step_reward = 0

        # Trap Logic
        captured = False
        if player_card == CARD_5:
            for nr, nc in neighbors:
                if not self.grid_revealed[nr][nc] and self.grid_values[nr][nc] == CARD_5:
                    captured = True; break

        if captured:
            self.hand.pop(0)
            # Penalty for hitting a trap.
            # Implicitly, we now know (nr, nc) is a 5.
            # We don't mark it known in code per game rules,
            # but AI should learn this pattern via negative reward.
            step_reward = -10
        else:
            was_unknown = not self.grid_known[r][c]

            self.grid_revealed[r][c] = True
            self.grid_known[r][c] = True

            # Highlights
            has_neighbor_5 = False
            for nr, nc in neighbors:
                if self.grid_values[nr][nc] == CARD_5: has_neighbor_5 = True; break
            if has_neighbor_5:
                for nr, nc in neighbors: self.grid_highlights[nr][nc] = True

            # Combat / Scoring
            if player_card == CARD_K:
                if board_card == CARD_K:
                    self.score += 100
                    self.hand.pop(0)
                else:
                    self.game_over = True
                    step_reward = -50 # Game Over
            else:
                points = POINTS[board_card]
                if player_card > board_card:
                    self.score += points
                elif player_card == board_card:
                    self.score += points
                    self.hand.pop(0)
                else:
                    # Loss
                    self.hand.pop(0)
                    self.grid_revealed[r][c] = False # Re-hide

                    # REWARD SHAPING:
                    # If it was unknown, it's bad luck (small penalty).
                    # If it was known, it's stupidity (handled by mask/suicide check),
                    # but if we somehow got here, punish.
                    if was_unknown:
                        step_reward = -2
                    else:
                        step_reward = -20

            # Bonuses
            if self.grid_revealed[r][c] and not self.game_over:
                b_pts = 0
                if not self.rows_completed[r] and all(self.grid_revealed[r, :]):
                    b_pts += 10; self.rows_completed[r] = True
                if not self.cols_completed[c] and all(self.grid_revealed[:, c]):
                    b_pts += 10; self.cols_completed[c] = True
                self.score += b_pts

        if not self.hand: self.game_over = True

        reward = (self.score - prev_score) + step_reward
        return self.get_observation_vector(), reward, self.game_over