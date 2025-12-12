import numpy as np
import random

SCORE_GOLD = 550
SCORE_SILVER = 400

CARD_1, CARD_2, CARD_3, CARD_4, CARD_5, CARD_K = 1, 2, 3, 4, 5, 6
POINTS = {1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 100}

# Optimized Input:
# 5x5 Grid x 6 Channels (added definitely_not_5 channel)
INPUT_SIZE = 157  # 5*5*6 + 7 = 150 + 7 = 157
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

        # Hand: 5x1, 2x2, 2x3, 1x4, 1x5, 1xK
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

    def _compute_triangulation(self):
        """
        Advanced constraint logic to determine which cells are DEFINITELY NOT 5s
        and which cells are likely to contain 5s based on hint triangulation.

        Logic:
        1. When a card is revealed and NO 5 is among its neighbors, ALL neighbors
           are marked as definitely_not_5.
        2. When a card is revealed and a 5 IS among its neighbors (hint appeared),
           that cell becomes a "hint source" - the 5 must be in one of its
           unrevealed neighbors that aren't already ruled out.
        3. By intersecting constraints from multiple hint sources, we can narrow
           down the possible 5 locations.
        4. If a potential 5 location is ruled out by being a neighbor of a
           no-hint source, remove it from consideration.
        """

        # Track which cells are DEFINITELY NOT 5s
        definitely_not_5 = np.zeros((5, 5), dtype=bool)

        # Track hint sources and no-hint sources
        hint_sources = []      # Cells where hint appeared (5 nearby)
        no_hint_sources = []   # Cells where no hint appeared (no 5 nearby)

        # --- Pass 1: Identify hint sources and no-hint sources ---
        for r in range(5):
            for c in range(5):
                # Only consider cells we've seen (revealed or known)
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

        # Rule 1: Any neighbor of a no-hint source cannot be a 5
        for r, c in no_hint_sources:
            neighbors = self._get_neighbors(r, c)
            for nr, nc in neighbors:
                definitely_not_5[nr][nc] = True

        # Rule 2: Any revealed/known card that we've seen and isn't a 5
        for r in range(5):
            for c in range(5):
                if self.grid_revealed[r][c] or self.grid_known[r][c]:
                    if self.grid_values[r][c] != CARD_5:
                        definitely_not_5[r][c] = True
                    # Note: if it IS a 5 and known, we leave it as possibly 5
                    # (it's a known 5, which is tracked separately)

        # --- Pass 3: Compute constrained 5 locations from hint sources ---
        # For each hint source, identify which unrevealed neighbors could contain the 5

        # possible_5_cells_per_hint[i] = set of (r,c) that could contain the 5
        # that triggered hint source i
        constrained_5_regions = []

        for hr, hc in hint_sources:
            neighbors = self._get_neighbors(hr, hc)
            candidate_cells = set()

            for nr, nc in neighbors:
                # The 5 must be unrevealed (or known as 5)
                if not self.grid_revealed[nr][nc]:
                    if self.grid_known[nr][nc]:
                        # Known but not revealed - check if it's actually a 5
                        if self.grid_values[nr][nc] == CARD_5:
                            candidate_cells.add((nr, nc))
                        # If known and not 5, it can't be the source of this hint
                    else:
                        # Unknown cell - could be 5 if not ruled out
                        if not definitely_not_5[nr][nc]:
                            candidate_cells.add((nr, nc))

            if candidate_cells:
                constrained_5_regions.append(candidate_cells)

        # --- Pass 4: Compute high-probability 5 locations ---
        # Cells that appear in multiple constraint regions are more likely to be 5s

        high_prob_5 = np.zeros((5, 5), dtype=np.float32)

        if constrained_5_regions:
            # Count how many constraint regions each cell appears in
            appearance_count = {}
            for region in constrained_5_regions:
                for cell in region:
                    appearance_count[cell] = appearance_count.get(cell, 0) + 1

            # Cells appearing in more regions are more likely to be 5s
            max_appearances = max(appearance_count.values()) if appearance_count else 1

            for (r, c), count in appearance_count.items():
                # Normalize: cells in all constraint regions get highest probability
                high_prob_5[r][c] = count / max_appearances

            # Special case: if a constraint region has only ONE candidate,
            # that cell is DEFINITELY a 5
            for region in constrained_5_regions:
                if len(region) == 1:
                    cell = list(region)[0]
                    high_prob_5[cell[0]][cell[1]] = 1.0

        return definitely_not_5, high_prob_5, hint_sources, constrained_5_regions

    def get_observation_vector(self):
        # --- 1. Calculate Remaining Deck (Card Counting) ---
        current_board_counts = self.full_deck_counts.copy()
        unknown_indices = []

        for r in range(5):
            for c in range(5):
                if self.grid_revealed[r][c] or self.grid_known[r][c]:
                    val = self.grid_values[r][c]
                    current_board_counts[val] = max(0, current_board_counts[val] - 1)
                else:
                    unknown_indices.append((r, c))

        total_unknown = len(unknown_indices)

        # --- 2. Advanced Constraint Logic (Triangulation) ---
        definitely_not_5, high_prob_5, hint_sources, constrained_regions = self._compute_triangulation()

        # --- 3. Build refined probability map for 5s ---
        prob_5_map = np.zeros((5, 5), dtype=np.float32)
        possible_5s = current_board_counts[CARD_5]

        # Count cells that could potentially have a 5
        potential_5_cells = [
            (r, c) for r, c in unknown_indices
            if not definitely_not_5[r][c]
        ]
        num_potential = len(potential_5_cells)

        # Base probability for unknown cells that aren't ruled out
        if num_potential > 0 and possible_5s > 0:
            base_prob_5 = min(1.0, possible_5s / num_potential)
        else:
            base_prob_5 = 0.0

        for r in range(5):
            for c in range(5):
                if self.grid_revealed[r][c]:
                    # Revealed and captured - no danger
                    prob_5_map[r][c] = 0.0
                elif self.grid_known[r][c]:
                    # Known but not revealed (re-hidden)
                    val = self.grid_values[r][c]
                    prob_5_map[r][c] = 1.0 if val == CARD_5 else 0.0
                else:
                    # Unknown cell
                    if definitely_not_5[r][c]:
                        prob_5_map[r][c] = 0.0
                    elif high_prob_5[r][c] > 0:
                        # Use triangulation-derived probability
                        prob_5_map[r][c] = max(base_prob_5, high_prob_5[r][c])
                    else:
                        prob_5_map[r][c] = base_prob_5

        # --- 4. Build active hint map ---
        active_hint_map = np.zeros((5, 5), dtype=np.float32)
        for r, c in hint_sources:
            active_hint_map[r][c] = 1.0

        # --- 5. Build Channels ---
        # Channel 0: Board State
        # Channel 1: Win Probability
        # Channel 2: Danger (prob of 5)
        # Channel 3: King Probability
        # Channel 4: Hint Source
        # Channel 5: Definitely NOT 5 (new channel)

        grid_obs = np.zeros((6, 5, 5), dtype=np.float32)
        current_hand_card = self.hand[0] if self.hand else 0

        # Precompute win/loss logic for current hand
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
                    grid_obs[0][r][c] = 0.0  # Captured/revealed
                elif self.grid_known[r][c]:
                    grid_obs[0][r][c] = self.grid_values[r][c] / 6.0  # Known value
                else:
                    grid_obs[0][r][c] = -1.0  # Unknown

                # Channel 5: Definitely NOT 5 (safe from 5-capture)
                grid_obs[5][r][c] = 1.0 if definitely_not_5[r][c] else 0.0

                # For unknown cells
                if not (self.grid_revealed[r][c] or self.grid_known[r][c]):
                    # Channel 2: Danger (probability of 5)
                    grid_obs[2][r][c] = prob_5_map[r][c]

                    # Channel 3: King probability
                    if current_board_counts[CARD_K] > 0:
                        # King could be in any unknown cell not ruled out
                        # (we don't have king-specific triangulation, so uniform)
                        grid_obs[3][r][c] = 1.0 / total_unknown
                    else:
                        grid_obs[3][r][c] = 0.0

                    # Channel 1: Win Probability
                    if definitely_not_5[r][c]:
                        # We know it's not a 5, so adjust win probability
                        # Remove 5s from consideration for this cell
                        adjusted_wins = wins_in_deck
                        adjusted_total = total_unknown
                        if current_hand_card != CARD_K and current_hand_card < CARD_5:
                            # 5s would have been wins, but this cell isn't a 5
                            # Slightly increase win prob since we ruled out a card type
                            pass  # Keep base probability for simplicity
                        grid_obs[1][r][c] = prob_win_base
                    else:
                        grid_obs[1][r][c] = prob_win_base

                # For known (but hidden) cells
                elif self.grid_known[r][c] and not self.grid_revealed[r][c]:
                    val = self.grid_values[r][c]

                    # Channel 2: Danger
                    grid_obs[2][r][c] = 1.0 if val == CARD_5 else 0.0

                    # Channel 3: King
                    grid_obs[3][r][c] = 1.0 if val == CARD_K else 0.0

                    # Channel 1: Win Probability (known outcome)
                    if current_hand_card == CARD_K:
                        grid_obs[1][r][c] = 1.0 if val == CARD_K else 0.0
                    else:
                        grid_obs[1][r][c] = 1.0 if val >= current_hand_card else 0.0

                # Channel 4: Hint Source
                grid_obs[4][r][c] = active_hint_map[r][c]

        # --- 6. Build scalar features ---
        flat_grid = grid_obs.flatten()  # 5*5*6 = 150
        hand_scalar = [current_hand_card / 6.0]
        deck_scalar = [current_board_counts[k]/25.0 for k in range(1, 7)]

        return np.concatenate([flat_grid, hand_scalar, deck_scalar]).astype(np.float32)

    def apply_move(self, move_coords):
        """
        Executes a move for the UI/Game Logic.
        Returns 'info' dictionary used by the interface to show animations.
        """
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

        # 1. Suicide Check (Known card that we LOSE to)
        # FIX: Changed <= to <. We want to allow hitting a known Draw (Same Value) to get points.
        if self.grid_known[r][c] and player_card < board_card:
            # Exception: King vs King is valid
            if not (player_card == CARD_K and board_card == CARD_K):
                self.hand.pop(0)
                info['hand_popped'] = True
                info['re_hidden'] = True # effectively wasted turn
                if not self.hand: self.game_over = True
                return info

        # 2. Capture by Hidden 5 Check
        captured = False
        neighbors = self._get_neighbors(r, c)
        if player_card == CARD_5:
            for nr, nc in neighbors:
                # Capture happens if neighbor is a 5 and NOT REVEALED
                if not self.grid_revealed[nr][nc] and self.grid_values[nr][nc] == CARD_5:
                    captured = True
                    break

        if captured:
            self.hand.pop(0)
            info['hand_popped'] = True
            info['re_hidden'] = True
            # Card remains hidden
        else:
            # 3. Reveal and Compare
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
                    # Win: Get points, keep card (don't pop hand)
                    self.score += points
                    self.grid_revealed[r][c] = True
                elif player_card == board_card:
                    # Draw: Get points, next card
                    self.score += points
                    self.hand.pop(0)
                    self.grid_revealed[r][c] = True
                    info['hand_popped'] = True
                else:
                    # Loss: No points, next card, re-hide board card
                    self.hand.pop(0)
                    self.grid_revealed[r][c] = False
                    info['hand_popped'] = True
                    info['re_hidden'] = True

            # 4. Bonuses (Row/Col)
            if self.grid_revealed[r][c] and not self.game_over:
                b_pts = 0
                if not self.rows_completed[r] and all(self.grid_revealed[r, :]):
                    b_pts += 10; self.rows_completed[r] = True
                if not self.cols_completed[c] and all(self.grid_revealed[:, c]):
                    b_pts += 10; self.cols_completed[c] = True
                self.score += b_pts

        if not self.hand: self.game_over = True
        return info

    def get_valid_moves_mask(self):
        mask = np.zeros(25, dtype=bool)
        if self.game_over: return mask

        current_card = self.hand[0] if self.hand else 0
        unknown_exist = False

        for i in range(25):
            r, c = divmod(i, 5)
            if not self.grid_known[r][c] and not self.grid_revealed[r][c]:
                unknown_exist = True
                break

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
                         # Known Loss: Mask out if we have other options
                         if unknown_exist: mask[i] = False
                         else: mask[i] = True
                    else:
                        # Known Win or Draw: Valid
                        mask[i] = True
                else:
                    mask[i] = True

        if not np.any(mask):
            for i in range(25):
                if not self.grid_revealed.flatten()[i]: mask[i] = True
        return mask

    def step(self, action_idx):
        """
        RL Step function.
        Replicates apply_move logic but calculates specific scalar rewards for training.
        """
        if self.game_over:
            return self.get_observation_vector(), 0, True

        r, c = divmod(action_idx, 5)

        # Invalid Move
        if self.grid_revealed[r][c]:
            return self.get_observation_vector(), -50, self.game_over

        prev_score = self.score

        # Use apply_move to handle state transition
        was_unknown = not self.grid_known[r][c]

        player_card = self.hand[0]
        board_card = self.grid_values[r][c]

        # FIX: Suicide calculation must match apply_move (only STRICT loss is suicide)
        suicide = False
        if self.grid_known[r][c] and player_card < board_card:
            if not (player_card == CARD_K and board_card == CARD_K):
                suicide = True

        info = self.apply_move((r, c))

        step_reward = 0

        # Calculate Reward based on result
        if suicide:
            # Punishment for playing a known strict loss
            step_reward = -50
        elif info['re_hidden']:
            # Either capture by 5, or lost comparison
            if player_card == CARD_5 and board_card != CARD_5 and not self.grid_revealed[r][c]:
                 # Was captured by neighbor 5
                 step_reward = -15
            else:
                 # Lost comparison
                 step_reward = -5 if was_unknown else -30
        elif info['hand_popped']:
            # Draw or King Win
            if player_card == CARD_K:
                step_reward = 50 # King found King
            else:
                step_reward = 5 # Draw
        elif not info['hand_popped'] and not info['re_hidden']:
            # Standard Win (card not popped)
            step_reward = 15

        if self.game_over and self.score < 100 and player_card == CARD_K:
             # Died using King incorrectly
             step_reward = -100

        # Add score difference (includes bonuses)
        reward = (self.score - prev_score) + step_reward

        return self.get_observation_vector(), reward, self.game_over


# =============================================================================
# Utility function to visualize triangulation (for debugging)
# =============================================================================

def debug_triangulation(game_state):
    """
    Debug function to visualize what the triangulation logic has determined.
    """
    definitely_not_5, high_prob_5, hint_sources, constrained_regions = game_state._compute_triangulation()

    print("=== Triangulation Debug ===")
    print(f"Actual 5 locations:")
    for r in range(5):
        for c in range(5):
            if game_state.grid_values[r][c] == CARD_5:
                print(f"  5 at ({r}, {c})")

    print(f"\nHint sources (revealed cards with 5 nearby): {hint_sources}")
    print(f"Number of constraint regions: {len(constrained_regions)}")

    print("\nDefinitely NOT 5 map:")
    for r in range(5):
        row_str = ""
        for c in range(5):
            if game_state.grid_revealed[r][c]:
                row_str += " R "
            elif game_state.grid_known[r][c]:
                row_str += " K "
            elif definitely_not_5[r][c]:
                row_str += " X "  # Ruled out
            else:
                row_str += " ? "  # Could be 5
        print(row_str)

    print("\nHigh probability 5 map:")
    for r in range(5):
        row_str = ""
        for c in range(5):
            prob = high_prob_5[r][c]
            if prob >= 0.99:
                row_str += " ! "  # Definitely 5
            elif prob > 0.5:
                row_str += " H "  # High prob
            elif prob > 0:
                row_str += " M "  # Medium prob
            else:
                row_str += " . "  # Low/zero
        print(row_str)

    print("===========================")