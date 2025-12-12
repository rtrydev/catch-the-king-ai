import numpy as np
import random

SCORE_GOLD = 550
SCORE_SILVER = 400

CARD_1, CARD_2, CARD_3, CARD_4, CARD_5, CARD_K = 1, 2, 3, 4, 5, 6
POINTS = {1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 100}

# 5x5 Grid x 17 Channels + 18 Scalars
# Grid Channels:
# 0-5: Card IDs, 6: Revealed, 7: Known, 8: Hint, 9: Safe,
# 10-15: Probs, 16: POTENTIAL SCORE (New)
# Total Grid: 17 * 25 = 425
# Scalars: 18
# Total Input: 443
INPUT_SIZE = 443
OUTPUT_SIZE = 25

class GameState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.full_deck_counts = {1:7, 2:4, 3:5, 4:5, 5:3, 6:1}
        board_deck = []
        for card, count in self.full_deck_counts.items():
            board_deck.extend([card] * count)
        random.shuffle(board_deck)

        self.grid_values = np.array(board_deck).reshape(5, 5)
        self.grid_revealed = np.full((5, 5), False, dtype=bool)
        self.grid_known = np.full((5, 5), False, dtype=bool)

        self.hand = ([CARD_1]*5 + [CARD_2]*2 + [CARD_3]*2 +
                     [CARD_4]*1 + [CARD_5]*1 + [CARD_K]*1)
        self.score = 0
        self.game_over = False
        self.rows_completed = [False] * 5
        self.cols_completed = [False] * 5
        return self.get_observation_vector()

    def _get_neighbors(self, r, c):
        neighbors = []
        r_min, r_max = max(0, r-1), min(4, r+1)
        c_min, c_max = max(0, c-1), min(4, c+1)
        for nr in range(r_min, r_max + 1):
            for nc in range(c_min, c_max + 1):
                if nr == r and nc == c: continue
                neighbors.append((nr, nc))
        return neighbors

    def get_observation_vector(self):
        # --- 1. Dynamic Hint & Safety Calculation ---
        hint_counts = np.zeros((5, 5), dtype=np.float32)
        safe_from_5_mask = np.full((5, 5), False, dtype=bool)

        for r in range(5):
            for c in range(5):
                if self.grid_revealed[r][c] or self.grid_known[r][c]:
                    if self.grid_values[r][c] != CARD_5:
                        safe_from_5_mask[r][c] = True

                    neighbors = self._get_neighbors(r, c)
                    found_5_nearby = False
                    for nr, nc in neighbors:
                        if self.grid_values[nr][nc] == CARD_5:
                            found_5_nearby = True
                            break

                    if found_5_nearby:
                        for nr, nc in neighbors: hint_counts[nr][nc] += 1.0
                    else:
                        for nr, nc in neighbors: safe_from_5_mask[nr][nc] = True

        hint_counts[safe_from_5_mask] = 0.0

        # --- 2. Calculate Statistics ---
        current_board_counts = self.full_deck_counts.copy()
        unknown_cells_count = 0
        for r in range(5):
            for c in range(5):
                if self.grid_revealed[r][c] or self.grid_known[r][c]:
                    val = self.grid_values[r][c]
                    current_board_counts[val] = max(0, current_board_counts[val] - 1)
                else:
                    unknown_cells_count += 1

        # --- 3. Build Grid Channels (17 Channels) ---
        # Channels 0-16
        grid_obs = np.zeros((17, 5, 5), dtype=np.float32)

        current_hand_card = self.hand[0] if self.hand else 0

        for r in range(5):
            for c in range(5):
                val = self.grid_values[r][c]

                # Ch 0-5: Identity
                # Ch 6: Revealed
                # Ch 7: Known
                if self.grid_revealed[r][c]:
                    grid_obs[val-1][r][c] = 1.0
                    grid_obs[6][r][c] = 1.0
                elif self.grid_known[r][c]:
                    grid_obs[val-1][r][c] = 1.0
                    grid_obs[7][r][c] = 1.0
                else:
                    # Ch 10-15: Probabilities
                    if unknown_cells_count > 0:
                        for card_k in range(1, 7):
                            prob = current_board_counts[card_k] / unknown_cells_count
                            if card_k == CARD_5 and safe_from_5_mask[r][c]:
                                prob = 0.0
                            grid_obs[9 + card_k][r][c] = prob

                # Ch 8: Hint Strength
                if hint_counts[r][c] > 0:
                    grid_obs[8][r][c] = min(1.0, hint_counts[r][c] / 8.0)

                # Ch 9: Safe From 5
                if safe_from_5_mask[r][c]:
                    grid_obs[9][r][c] = 1.0

                # --- NEW LOGIC: Ch 16: Potential Score ---
                # This explicitly tells the AI the value of the move if it knows the card.
                score_val = 0
                if self.grid_known[r][c] and current_hand_card > 0:
                    # Logic mimics step() scoring
                    if current_hand_card == CARD_K:
                        if val == CARD_K: score_val = 100
                        else: score_val = -100 # Death
                    else:
                        if current_hand_card > val: score_val = POINTS[val]
                        elif current_hand_card == val: score_val = POINTS[val]
                        else: score_val = -5 # Just a discard/loss of turn, roughly

                # Normalize score (-100 to 100) -> (-1.0 to 1.0)
                grid_obs[16][r][c] = score_val / 100.0

        flat_grid = grid_obs.flatten()

        # --- 4. Scalars (18) ---
        hand_vec = [0.0]*6
        if self.hand: hand_vec[self.hand[0]-1] = 1.0

        hand_counts = [0]*6
        for card in self.hand: hand_counts[card-1] += 1
        hand_counts = [x/5.0 for x in hand_counts]

        deck_rem = [current_board_counts[k]/25.0 for k in sorted(current_board_counts.keys())]

        obs = np.concatenate([flat_grid, hand_vec, hand_counts, deck_rem])
        return obs.astype(np.float32)

    # ... [Rest of GameState (apply_move, get_valid_moves, step) remains the same] ...
    # Ensure apply_move and step are included as they were in your original code
    def apply_move(self, move_coords):
        # (Keep your original apply_move code here)
        # For brevity, assuming it's the same as your provided snippet
        r, c = move_coords
        player_card = self.hand[0] if self.hand else None
        info = {'hand_popped': False, 're_hidden': False, 'popped_card': player_card}
        neighbors = self._get_neighbors(r, c)
        board_card = self.grid_values[r][c]

        if self.grid_known[r][c] and player_card <= board_card:
            if not (player_card == 6 and board_card == 6):
                self.hand.pop(0)
                info['hand_popped'] = True
                info['re_hidden'] = True
                if not self.hand: self.game_over = True
                return info

        captured = False
        if player_card == 5:
            for nr, nc in neighbors:
                if not self.grid_revealed[nr][nc] and self.grid_values[nr][nc] == 5:
                    captured = True; break
        if captured:
            self.hand.pop(0); info['hand_popped'] = True; info['re_hidden'] = True
        else:
            self.grid_revealed[r][c] = True; self.grid_known[r][c] = True
            if player_card == 6:
                if board_card == 6: self.score += 100; self.hand.pop(0); info['hand_popped'] = True
                else: self.game_over = True
            else:
                points = POINTS[board_card]
                if player_card > board_card: self.score += points
                elif player_card == board_card: self.score += points; self.hand.pop(0); info['hand_popped'] = True
                else: self.hand.pop(0); self.grid_revealed[r][c] = False; info['hand_popped'] = True; info['re_hidden'] = True

            if self.grid_revealed[r][c] and not self.game_over:
                b_pts = 0
                if not self.rows_completed[r] and all(self.grid_revealed[r, :]): b_pts += 10; self.rows_completed[r] = True
                if not self.cols_completed[c] and all(self.grid_revealed[:, c]): b_pts += 10; self.cols_completed[c] = True
                self.score += b_pts

        if not self.hand: self.game_over = True
        return info

    def get_valid_moves_mask(self):
        mask = np.zeros(25, dtype=bool)
        if self.game_over: return mask
        current_card = self.hand[0] if self.hand else 0
        for r in range(5):
            for c in range(5):
                i = r * 5 + c
                if self.grid_revealed[r][c]: mask[i] = False; continue
                if self.grid_known[r][c]:
                    board_val = self.grid_values[r][c]
                    if current_card == CARD_K: mask[i] = True
                    elif current_card <= board_val: mask[i] = False
                    else: mask[i] = True
                else: mask[i] = True
        if not np.any(mask):
            for i in range(25):
                if not self.grid_revealed.flatten()[i]: mask[i] = True
        return mask

    def step(self, action_idx):
        if self.game_over: return self.get_observation_vector(), 0, True
        r, c = divmod(action_idx, 5)
        if self.grid_revealed[r][c]: return self.get_observation_vector(), -50, self.game_over

        prev_score = self.score
        player_card = self.hand[0]
        board_card = self.grid_values[r][c]

        # Explicitly handle Suicide (except King)
        if self.grid_known[r][c] and player_card <= board_card and player_card != CARD_K:
             self.hand.pop(0)
             if not self.hand: self.game_over = True
             return self.get_observation_vector(), -50, self.game_over

        neighbors = self._get_neighbors(r, c)
        step_reward = 0

        captured = False
        if player_card == CARD_5:
            for nr, nc in neighbors:
                if not self.grid_revealed[nr][nc] and self.grid_values[nr][nc] == CARD_5:
                    captured = True; break

        if captured:
            self.hand.pop(0)
            step_reward = -15
        else:
            was_unknown = not self.grid_known[r][c]
            self.grid_revealed[r][c] = True
            self.grid_known[r][c] = True

            if player_card == CARD_K:
                if board_card == CARD_K:
                    self.score += 100
                    self.hand.pop(0)
                    step_reward = 50 # Bonus incentive
                else:
                    self.game_over = True
                    step_reward = -100
            else:
                points = POINTS[board_card]
                if player_card > board_card:
                    self.score += points
                    step_reward += 15
                elif player_card == board_card:
                    self.score += points
                    self.hand.pop(0)
                else:
                    self.hand.pop(0)
                    self.grid_revealed[r][c] = False
                    step_reward = -5 if was_unknown else -30

            if self.grid_revealed[r][c] and not self.game_over:
                b_pts = 0
                if not self.rows_completed[r] and all(self.grid_revealed[r, :]): b_pts += 10; self.rows_completed[r] = True
                if not self.cols_completed[c] and all(self.grid_revealed[:, c]): b_pts += 10; self.cols_completed[c] = True
                self.score += b_pts
                step_reward += b_pts

        if not self.hand: self.game_over = True
        reward = (self.score - prev_score) + step_reward
        return self.get_observation_vector(), reward, self.game_over