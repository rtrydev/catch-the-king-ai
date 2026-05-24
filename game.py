import numpy as np
import random

SCORE_GOLD = 550
SCORE_SILVER = 400

CARD_1, CARD_2, CARD_3, CARD_4, CARD_5, CARD_K = 1, 2, 3, 4, 5, 6
POINTS = {1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 100}

INPUT_SIZE = 157
OUTPUT_SIZE = 25

class GameState:
    def __init__(self):
        self.reset()

    def reset(self, manual_mode=False):
        self.manual_mode = manual_mode
        self.full_deck_counts = {1:7, 2:4, 3:5, 4:5, 5:3, 6:1}

        if self.manual_mode:
            # In manual mode, we don't know the board yet. Initialize with 0.
            self.grid_values = np.zeros((5, 5), dtype=int)
            self.manual_hints = set() # Stores coords (r,c) where user confirmed a hint exists
        else:
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

        # --- TRACKING COMPLETED LINES ---
        self.rows_completed = [False] * 5
        self.cols_completed = [False] * 5
        self.diag1_completed = False # Top-left to bottom-right
        self.diag2_completed = False # Bottom-left to top-right

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

    def _compute_triangulation(self):
        definitely_not_5 = np.zeros((5, 5), dtype=bool)
        hint_sources = []
        no_hint_sources = []

        # --- Pass 1: Identify hint sources ---
        if self.manual_mode:
            # In manual mode, we rely on what the user told us
            for r in range(5):
                for c in range(5):
                    if self.grid_revealed[r][c] or self.grid_known[r][c]:
                        if (r, c) in self.manual_hints:
                            hint_sources.append((r, c))
                        else:
                            no_hint_sources.append((r, c))
        else:
            # Existing logic for auto mode
            for r in range(5):
                for c in range(5):
                    if self.grid_revealed[r][c] or self.grid_known[r][c]:
                        neighbors = self._get_neighbors(r, c)
                        found_5_nearby = False
                        for nr, nc in neighbors:
                            if self.grid_values[nr][nc] == CARD_5:
                                found_5_nearby = True
                                break
                        if found_5_nearby:
                            hint_sources.append((r, c))
                        else:
                            no_hint_sources.append((r, c))

        # --- Pass 2: Mark cells that are DEFINITELY NOT 5s ---
        for r, c in no_hint_sources:
            neighbors = self._get_neighbors(r, c)
            for nr, nc in neighbors:
                definitely_not_5[nr][nc] = True

        for r in range(5):
            for c in range(5):
                # Check revealed/known.
                # In manual mode, unrevealed grid_values are 0, so != CARD_5 is true, which is correct.
                # But we only want to mark revealed things as not 5 (unless they ARE 5).
                if self.grid_revealed[r][c] or self.grid_known[r][c]:
                    if self.grid_values[r][c] != CARD_5:
                        definitely_not_5[r][c] = True

        # --- Pass 3: Compute constrained 5 locations ---
        constrained_5_regions = []
        for hr, hc in hint_sources:
            neighbors = self._get_neighbors(hr, hc)
            candidate_cells = set()
            for nr, nc in neighbors:
                if not self.grid_revealed[nr][nc]:
                    if self.grid_known[nr][nc]:
                        if self.grid_values[nr][nc] == CARD_5:
                            candidate_cells.add((nr, nc))
                    else:
                        if not definitely_not_5[nr][nc]:
                            candidate_cells.add((nr, nc))
            if candidate_cells:
                constrained_5_regions.append(candidate_cells)

        # --- Pass 4: Compute high-probability 5 locations ---
        high_prob_5 = np.zeros((5, 5), dtype=np.float32)
        if constrained_5_regions:
            appearance_count = {}
            for region in constrained_5_regions:
                for cell in region:
                    appearance_count[cell] = appearance_count.get(cell, 0) + 1
            max_appearances = max(appearance_count.values()) if appearance_count else 1
            for (r, c), count in appearance_count.items():
                high_prob_5[r][c] = count / max_appearances
            for region in constrained_5_regions:
                if len(region) == 1:
                    cell = list(region)[0]
                    high_prob_5[cell[0]][cell[1]] = 1.0

        return definitely_not_5, high_prob_5, hint_sources, constrained_5_regions

    def get_observation_vector(self):
        # --- 1. Calculate Remaining Deck ---
        current_board_counts = self.full_deck_counts.copy()
        unknown_indices = []

        for r in range(5):
            for c in range(5):
                # Logic works for both modes:
                # In Manual, grid_values has the actual value if revealed/known, else 0.
                if self.grid_revealed[r][c] or self.grid_known[r][c]:
                    val = self.grid_values[r][c]
                    if val > 0: # Sanity check for manual mode initialization
                        current_board_counts[val] = max(0, current_board_counts[val] - 1)
                else:
                    unknown_indices.append((r, c))

        total_unknown = len(unknown_indices)

        # --- 2. Advanced Constraint Logic ---
        definitely_not_5, high_prob_5, hint_sources, constrained_regions = self._compute_triangulation()

        # --- 3. Build refined probability map for 5s ---
        prob_5_map = np.zeros((5, 5), dtype=np.float32)
        possible_5s = current_board_counts[CARD_5]

        potential_5_cells = [
            (r, c) for r, c in unknown_indices
            if not definitely_not_5[r][c]
        ]
        num_potential = len(potential_5_cells)

        if num_potential > 0 and possible_5s > 0:
            base_prob_5 = min(1.0, possible_5s / num_potential)
        else:
            base_prob_5 = 0.0

        for r in range(5):
            for c in range(5):
                if self.grid_revealed[r][c]:
                    prob_5_map[r][c] = 0.0
                elif self.grid_known[r][c]:
                    val = self.grid_values[r][c]
                    prob_5_map[r][c] = 1.0 if val == CARD_5 else 0.0
                else:
                    if definitely_not_5[r][c]:
                        prob_5_map[r][c] = 0.0
                    elif high_prob_5[r][c] > 0:
                        prob_5_map[r][c] = max(base_prob_5, high_prob_5[r][c])
                    else:
                        prob_5_map[r][c] = base_prob_5

        # --- 4. Build active hint map ---
        active_hint_map = np.zeros((5, 5), dtype=np.float32)
        for r, c in hint_sources:
            active_hint_map[r][c] = 1.0

        # --- 5. Build Channels ---
        grid_obs = np.zeros((6, 5, 5), dtype=np.float32)
        current_hand_card = self.hand[0] if self.hand else 0

        wins_in_deck = 0
        for val, count in current_board_counts.items():
            if current_hand_card == CARD_K:
                if val == CARD_K: wins_in_deck += count
            else:
                if val >= current_hand_card: wins_in_deck += count

        prob_win_base = wins_in_deck / total_unknown if total_unknown > 0 else 0

        for r in range(5):
            for c in range(5):
                # Channel 0: Board State
                if self.grid_revealed[r][c]:
                    grid_obs[0][r][c] = 0.0
                elif self.grid_known[r][c]:
                    grid_obs[0][r][c] = self.grid_values[r][c] / 6.0
                else:
                    grid_obs[0][r][c] = -1.0

                # Channel 5: Definitely NOT 5
                grid_obs[5][r][c] = 1.0 if definitely_not_5[r][c] else 0.0

                if not (self.grid_revealed[r][c] or self.grid_known[r][c]):
                    grid_obs[2][r][c] = prob_5_map[r][c]
                    if current_board_counts[CARD_K] > 0:
                        grid_obs[3][r][c] = 1.0 / total_unknown
                    else:
                        grid_obs[3][r][c] = 0.0
                    grid_obs[1][r][c] = prob_win_base
                elif self.grid_known[r][c] and not self.grid_revealed[r][c]:
                    val = self.grid_values[r][c]
                    grid_obs[2][r][c] = 1.0 if val == CARD_5 else 0.0
                    grid_obs[3][r][c] = 1.0 if val == CARD_K else 0.0
                    if current_hand_card == CARD_K:
                        grid_obs[1][r][c] = 1.0 if val == CARD_K else 0.0
                    else:
                        grid_obs[1][r][c] = 1.0 if val >= current_hand_card else 0.0

                # Channel 4: Hint Source
                grid_obs[4][r][c] = active_hint_map[r][c]

        flat_grid = grid_obs.flatten()
        hand_scalar = [current_hand_card / 6.0]
        deck_scalar = [current_board_counts[k]/25.0 for k in range(1, 7)]

        return np.concatenate([flat_grid, hand_scalar, deck_scalar]).astype(np.float32)

    def apply_manual_input(self, move_coords, actual_value, has_hint):
        """
        Executes a move based on user input for Manual Mode.
        """
        r, c = move_coords
        player_card = self.hand[0] if self.hand else None

        # 1. Update Truth
        self.grid_values[r][c] = actual_value
        if has_hint:
            self.manual_hints.add((r, c))

        info = {
            'hand_popped': False,
            're_hidden': False,
            'popped_card': player_card,
            'show_hint': has_hint
        }

        # 1. Suicide Check (Known card that we LOSE to)
        # Note: In manual mode, 'known' usually implies we just entered it,
        # but if we are re-visiting a known card, this logic applies.
        if self.grid_known[r][c] and player_card < actual_value:
            if not (player_card == CARD_K and actual_value == CARD_K):
                self.hand.pop(0)
                info['hand_popped'] = True
                info['re_hidden'] = True
                if not self.hand: self.game_over = True
                return info

        # 2. Capture by Hidden 5 Check
        captured = False
        if player_card == CARD_5:
            # Simplification for Manual Mode: If user says Hint, and I played 5 -> Captured.
            if has_hint:
                captured = True

        if captured:
            self.grid_known[r][c] = True # FIX APPLIED: Mark cell as known so observation sees it
            self.hand.pop(0)
            info['hand_popped'] = True
            info['re_hidden'] = True
        else:
            # 3. Reveal and Compare
            self.grid_known[r][c] = True

            if player_card == CARD_K:
                self.grid_revealed[r][c] = True
                if actual_value == CARD_K:
                    self.score += 100
                    self.hand.pop(0)
                    info['hand_popped'] = True
                else:
                    self.game_over = True
            else:
                points = POINTS[actual_value]
                if player_card > actual_value:
                    self.score += points
                    self.grid_revealed[r][c] = True
                elif player_card == actual_value:
                    self.score += points
                    self.hand.pop(0)
                    self.grid_revealed[r][c] = True
                    info['hand_popped'] = True
                else:
                    self.hand.pop(0)
                    self.grid_revealed[r][c] = False
                    info['hand_popped'] = True
                    info['re_hidden'] = True

            # 4. Bonuses
            if self.grid_revealed[r][c] and not self.game_over:
                b_pts = 0
                # Row Bonus
                if not self.rows_completed[r] and all(self.grid_revealed[r, :]):
                    b_pts += 10; self.rows_completed[r] = True
                # Col Bonus
                if not self.cols_completed[c] and all(self.grid_revealed[:, c]):
                    b_pts += 10; self.cols_completed[c] = True

                # Diagonal 1 Bonus (Top-Left -> Bottom-Right)
                if not self.diag1_completed and r == c:
                    if all(self.grid_revealed[i][i] for i in range(5)):
                        b_pts += 10; self.diag1_completed = True

                # Diagonal 2 Bonus (Bottom-Left -> Top-Right)
                if not self.diag2_completed and r + c == 4:
                    if all(self.grid_revealed[i][4 - i] for i in range(5)):
                        b_pts += 10; self.diag2_completed = True

                self.score += b_pts

        if not self.hand: self.game_over = True
        return info

    def apply_move(self, move_coords):
        # Existing logic for auto mode...
        if self.manual_mode:
            raise ValueError("Cannot call apply_move in manual mode. Use apply_manual_input.")

        r, c = move_coords
        player_card = self.hand[0] if self.hand else None
        board_card = self.grid_values[r][c]

        show_hint = False
        neighbors = self._get_neighbors(r, c)
        for nr, nc in neighbors:
            if self.grid_values[nr][nc] == CARD_5:
                show_hint = True
                break

        info = {
            'hand_popped': False,
            're_hidden': False,
            'popped_card': player_card,
            'show_hint': show_hint
        }

        if self.grid_known[r][c] and player_card < board_card:
            if not (player_card == CARD_K and board_card == CARD_K):
                self.hand.pop(0)
                info['hand_popped'] = True
                info['re_hidden'] = True
                if not self.hand: self.game_over = True
                return info

        captured = False
        neighbors = self._get_neighbors(r, c)
        if player_card == CARD_5:
            for nr, nc in neighbors:
                if not self.grid_revealed[nr][nc] and self.grid_values[nr][nc] == CARD_5:
                    captured = True
                    break

        if captured:
            self.grid_known[r][c] = True # FIX APPLIED: Mark cell as known so observation sees it
            self.hand.pop(0)
            info['hand_popped'] = True
            info['re_hidden'] = True
        else:
            self.grid_known[r][c] = True

            if player_card == CARD_K:
                self.grid_revealed[r][c] = True
                if board_card == CARD_K:
                    self.score += 100
                    self.hand.pop(0)
                    info['hand_popped'] = True
                else:
                    self.game_over = True
            else:
                points = POINTS[board_card]
                if player_card > board_card:
                    self.score += points
                    self.grid_revealed[r][c] = True
                elif player_card == board_card:
                    self.score += points
                    self.hand.pop(0)
                    self.grid_revealed[r][c] = True
                    info['hand_popped'] = True
                else:
                    self.hand.pop(0)
                    self.grid_revealed[r][c] = False
                    info['hand_popped'] = True
                    info['re_hidden'] = True

            if self.grid_revealed[r][c] and not self.game_over:
                b_pts = 0
                # Row Bonus
                if not self.rows_completed[r] and all(self.grid_revealed[r, :]):
                    b_pts += 10; self.rows_completed[r] = True
                # Col Bonus
                if not self.cols_completed[c] and all(self.grid_revealed[:, c]):
                    b_pts += 10; self.cols_completed[c] = True

                # Diagonal 1 Bonus (Top-Left -> Bottom-Right)
                if not self.diag1_completed and r == c:
                    if all(self.grid_revealed[i][i] for i in range(5)):
                        b_pts += 10; self.diag1_completed = True

                # Diagonal 2 Bonus (Bottom-Left -> Top-Right)
                if not self.diag2_completed and r + c == 4:
                    if all(self.grid_revealed[i][4 - i] for i in range(5)):
                        b_pts += 10; self.diag2_completed = True

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
                if self.grid_revealed[r][c]:
                    mask[i] = False
                    continue

                if self.grid_known[r][c]:
                    board_val = self.grid_values[r][c]
                    if current_card == CARD_K:
                        mask[i] = (board_val == CARD_K)
                    elif board_val > current_card:
                        # Suicide on a known higher card: never a useful choice
                        # as long as ANY other legal cell exists. The final
                        # fallback below covers the all-suicide edge case.
                        mask[i] = False
                    else:
                        mask[i] = True
                else:
                    mask[i] = True

        if not np.any(mask):
            for i in range(25):
                if not self.grid_revealed.flatten()[i]: mask[i] = True
        return mask

    def get_capture_penalty_mask(self):
        """
        Inference-time safety: cells where clicking with the *current* hand card
        is a guaranteed capture-by-[5]. Only fires when the active card is [5]
        and the candidate cell has a face-down KNOWN [5] neighbor (engine knows
        the value, cell isn't revealed). Used to subtract a large constant from
        the model's Q-values before argmax, so the agent never blunders into a
        capture trap when a non-capture alternative is legal.
        """
        penalty = np.zeros(25, dtype=bool)
        if not self.hand or self.hand[0] != CARD_5 or self.game_over:
            return penalty
        for r in range(5):
            for c in range(5):
                if self.grid_revealed[r][c]:
                    continue
                for nr, nc in self._get_neighbors(r, c):
                    if (self.grid_known[nr][nc] and not self.grid_revealed[nr][nc]
                            and self.grid_values[nr][nc] == CARD_5):
                        penalty[r * 5 + c] = True
                        break
        return penalty

    # Step function for training remains mostly same,
    # but we assume training only happens in auto mode so we don't need to touch it much.
    def step(self, action_idx):
        if self.manual_mode: return None # No training in manual mode

        if self.game_over:
            return self.get_observation_vector(), 0, True

        r, c = divmod(action_idx, 5)
        if self.grid_revealed[r][c]:
            return self.get_observation_vector(), -50, self.game_over

        prev_score = self.score
        was_unknown = not self.grid_known[r][c]
        player_card = self.hand[0]
        board_card = self.grid_values[r][c]
        suicide = False
        if self.grid_known[r][c] and player_card < board_card:
            if not (player_card == CARD_K and board_card == CARD_K):
                suicide = True

        info = self.apply_move((r, c))

        step_reward = 0
        if suicide:
            step_reward = -50
        elif info['re_hidden']:
            if player_card == CARD_5 and board_card != CARD_5 and not self.grid_revealed[r][c]:
                step_reward = -15
            else:
                step_reward = 5 if was_unknown else -30
        elif info['hand_popped']:
            if player_card == CARD_K:
                step_reward = 50
            elif player_card == CARD_5 or was_unknown:
                step_reward = 5
            else:
                step_reward = -40
        elif not info['hand_popped'] and not info['re_hidden']:
            step_reward = 15

        if self.game_over and self.score < 100 and player_card == CARD_K:
            step_reward = -100

        reward = (self.score - prev_score) + step_reward
        return self.get_observation_vector(), reward, self.game_over