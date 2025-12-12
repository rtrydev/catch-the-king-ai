import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
from collections import deque
import math
import time

from game import INPUT_SIZE, OUTPUT_SIZE, GameState, SCORE_GOLD, SCORE_SILVER

# =============================================================================
# HYPERPARAMETERS - IMPROVED CONFIGURATION
# =============================================================================

# Training duration
NUM_EPISODES = 20000          # Increased from 20000
EVAL_INTERVAL = 100           # How often to print stats

# Replay buffer
MEMORY_SIZE = 150000          # Slightly larger buffer
MIN_MEMORY = 5000             # Don't train until this many samples collected
BATCH_SIZE = 64               # Reduced from 128 for more frequent rare event sampling

# Learning
LR = 5e-5                     # Reduced from 1e-4 for stability
GAMMA = 0.97                  # Reduced from 0.99 for clearer credit assignment
GRAD_CLIP = 0.5               # More aggressive gradient clipping

# Target network - using soft updates instead of hard updates
USE_SOFT_UPDATE = True
TAU = 0.005                   # Soft update coefficient
HARD_UPDATE_STEPS = 1000      # Fallback if not using soft updates

# Epsilon schedule - staged decay
EPS_START = 1.0
EPS_END = 0.02
# Phase 1: 0-50K steps:  1.0 -> 0.3 (heavy exploration)
# Phase 2: 50K-150K:     0.3 -> 0.1 (moderate exploration)
# Phase 3: 150K+:        0.1 -> 0.02 (exploitation)
EPS_PHASE1_END = 50000
EPS_PHASE2_END = 150000
EPS_PHASE3_END = 350000

# Prioritized Experience Replay
USE_PER = True
PER_ALPHA = 0.6               # Prioritization exponent (0=uniform, 1=full priority)
PER_BETA_START = 0.4          # Importance sampling correction start
PER_BETA_END = 1.0            # Anneal beta to 1.0 over training

# Learning rate scheduler
USE_LR_SCHEDULER = True
LR_DECAY_STEP = 15000         # Decay LR every N episodes
LR_DECAY_GAMMA = 0.5          # Multiply LR by this factor

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# =============================================================================
# PRIORITIZED EXPERIENCE REPLAY BUFFER
# =============================================================================

class PrioritizedReplayBuffer:
    """
    Prioritized Experience Replay buffer using sum-tree for efficient sampling.
    Transitions with higher TD-error are sampled more frequently.
    """
    def __init__(self, capacity, alpha=0.6):
        self.capacity = capacity
        self.alpha = alpha
        self.buffer = []
        self.priorities = np.zeros(capacity, dtype=np.float32)
        self.position = 0
        self.max_priority = 1.0

    def push(self, state, action, reward, next_state, done, mask):
        """Add transition with max priority (will be updated after first sample)."""
        if len(self.buffer) < self.capacity:
            self.buffer.append(None)

        self.buffer[self.position] = (state, action, reward, next_state, done, mask)
        self.priorities[self.position] = self.max_priority
        self.position = (self.position + 1) % self.capacity

    def sample(self, batch_size, beta=0.4):
        """Sample batch with probability proportional to priority."""
        if len(self.buffer) < batch_size:
            return None

        # Calculate sampling probabilities
        priorities = self.priorities[:len(self.buffer)]
        probabilities = priorities ** self.alpha
        prob_sum = probabilities.sum()

        if prob_sum == 0:
            probabilities = np.ones(len(self.buffer)) / len(self.buffer)
        else:
            probabilities /= prob_sum

        # Sample indices
        indices = np.random.choice(len(self.buffer), batch_size, p=probabilities, replace=False)

        # Calculate importance sampling weights
        total = len(self.buffer)
        weights = (total * probabilities[indices]) ** (-beta)
        weights /= weights.max()  # Normalize

        # Gather batch
        batch = [self.buffer[i] for i in indices]
        state, action, reward, next_state, done, mask = zip(*batch)

        return (state, action, reward, next_state, done, mask,
                indices, torch.FloatTensor(weights).to(device))

    def update_priorities(self, indices, td_errors):
        """Update priorities based on TD errors."""
        for idx, td_error in zip(indices, td_errors):
            priority = (abs(td_error) + 1e-5)  # Small constant for stability
            self.priorities[idx] = priority
            self.max_priority = max(self.max_priority, priority)

    def __len__(self):
        return len(self.buffer)


class UniformReplayBuffer:
    """Standard uniform replay buffer as fallback."""
    def __init__(self, capacity):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done, mask):
        self.buffer.append((state, action, reward, next_state, done, mask))

    def sample(self, batch_size, beta=None):
        if len(self.buffer) < batch_size:
            return None
        batch = random.sample(self.buffer, batch_size)
        state, action, reward, next_state, done, mask = zip(*batch)
        # Return uniform weights
        weights = torch.ones(batch_size).to(device)
        indices = None
        return state, action, reward, next_state, done, mask, indices, weights

    def update_priorities(self, indices, td_errors):
        pass  # No-op for uniform buffer

    def __len__(self):
        return len(self.buffer)


# =============================================================================
# NETWORK ARCHITECTURE (unchanged from original)
# =============================================================================

class CNNDuelingDQN(nn.Module):
    def __init__(self, input_dim, output_dim):
        super(CNNDuelingDQN, self).__init__()

        self.grid_features = 5
        self.grid_total_size = 25 * self.grid_features  # 125
        self.scalar_input_size = 7

        # Spatial Processing (CNN)
        self.conv_layer = nn.Sequential(
            nn.Conv2d(self.grid_features, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Flatten()
        )

        cnn_out_size = 128 * 5 * 5
        combined_size = cnn_out_size + self.scalar_input_size

        # Feature Merger
        self.fc_layer = nn.Sequential(
            nn.Linear(combined_size, 512),
            nn.ReLU(),
            nn.Dropout(0.1)  # Added dropout for regularization
        )

        # Value Stream
        self.value_stream = nn.Sequential(
            nn.Linear(512, 128),
            nn.ReLU(),
            nn.Linear(128, 1)
        )

        # Advantage Stream
        self.advantage_stream = nn.Sequential(
            nn.Linear(512, 128),
            nn.ReLU(),
            nn.Linear(128, output_dim)
        )

    def forward(self, x):
        board_part = x[:, :self.grid_total_size]
        scalar_part = x[:, self.grid_total_size:]

        batch_size = x.size(0)
        board_reshaped = board_part.view(batch_size, self.grid_features, 5, 5)

        cnn_out = self.conv_layer(board_reshaped)
        combined = torch.cat((cnn_out, scalar_part), dim=1)

        features = self.fc_layer(combined)
        values = self.value_stream(features)
        advantages = self.advantage_stream(features)

        qvals = values + (advantages - advantages.mean(dim=1, keepdim=True))
        return qvals


# =============================================================================
# EPSILON SCHEDULE
# =============================================================================

def get_epsilon(steps_done):
    """
    Staged epsilon decay:
    - Phase 1 (0-50K): Heavy exploration, 1.0 -> 0.3
    - Phase 2 (50K-150K): Moderate exploration, 0.3 -> 0.1
    - Phase 3 (150K-350K): Exploitation, 0.1 -> 0.02
    """
    if steps_done < EPS_PHASE1_END:
        # Linear decay from 1.0 to 0.3
        progress = steps_done / EPS_PHASE1_END
        return 1.0 - progress * 0.7
    elif steps_done < EPS_PHASE2_END:
        # Linear decay from 0.3 to 0.1
        progress = (steps_done - EPS_PHASE1_END) / (EPS_PHASE2_END - EPS_PHASE1_END)
        return 0.3 - progress * 0.2
    elif steps_done < EPS_PHASE3_END:
        # Linear decay from 0.1 to 0.02
        progress = (steps_done - EPS_PHASE2_END) / (EPS_PHASE3_END - EPS_PHASE2_END)
        return 0.1 - progress * 0.08
    else:
        return EPS_END


def get_beta(episode, total_episodes):
    """Anneal beta from PER_BETA_START to PER_BETA_END over training."""
    progress = min(1.0, episode / total_episodes)
    return PER_BETA_START + progress * (PER_BETA_END - PER_BETA_START)


# =============================================================================
# TRAINING ACTION SELECTION
# =============================================================================

def get_training_action(policy_net, state, valid_mask, steps_done):
    """Select action using epsilon-greedy with staged decay."""
    eps_threshold = get_epsilon(steps_done)

    if random.random() < eps_threshold:
        # Random action
        valid_indices = np.where(valid_mask)[0]
        if len(valid_indices) == 0:
            return 0
        return random.choice(valid_indices)
    else:
        # Greedy action
        with torch.no_grad():
            state_t = torch.FloatTensor(state).unsqueeze(0).to(device)
            q_values = policy_net(state_t).cpu().numpy()[0]
            q_values[~valid_mask] = -float('inf')
            return np.argmax(q_values)


# =============================================================================
# SOFT UPDATE
# =============================================================================

def soft_update(target_net, policy_net, tau):
    """Polyak averaging for smooth target updates."""
    for target_param, policy_param in zip(target_net.parameters(), policy_net.parameters()):
        target_param.data.copy_(tau * policy_param.data + (1 - tau) * target_param.data)


# =============================================================================
# TRAINING STEP
# =============================================================================

def train_step(policy_net, target_net, optimizer, memory, batch_size, beta):
    """Perform one training step with optional PER."""

    batch_data = memory.sample(batch_size, beta)
    if batch_data is None:
        return None

    states, actions, rewards, next_states, dones, masks, indices, weights = batch_data

    # Convert to tensors
    b_state = torch.FloatTensor(np.array(states)).to(device)
    b_action = torch.LongTensor(actions).unsqueeze(1).to(device)
    b_reward = torch.FloatTensor(rewards).unsqueeze(1).to(device)
    b_next = torch.FloatTensor(np.array(next_states)).to(device)
    b_done = torch.FloatTensor(dones).unsqueeze(1).to(device)
    b_mask = torch.tensor(np.array(masks), dtype=torch.bool).to(device)

    # Double DQN: Select action with policy net, evaluate with target net
    with torch.no_grad():
        policy_next_q = policy_net(b_next)
        policy_next_q[~b_mask] = -float('inf')
        best_action = policy_next_q.argmax(1).unsqueeze(1)

        target_next_q = target_net(b_next).gather(1, best_action)
        expected_q = b_reward + (GAMMA * target_next_q * (1 - b_done))

    # Current Q values
    curr_q = policy_net(b_state).gather(1, b_action)

    # Calculate TD errors for priority updates
    td_errors = (curr_q - expected_q).detach().cpu().numpy().flatten()

    # Weighted loss (weights from importance sampling)
    element_wise_loss = nn.SmoothL1Loss(reduction='none')(curr_q, expected_q)
    loss = (weights.unsqueeze(1) * element_wise_loss).mean()

    # Optimize
    optimizer.zero_grad()
    loss.backward()
    torch.nn.utils.clip_grad_norm_(policy_net.parameters(), GRAD_CLIP)
    optimizer.step()

    # Update priorities if using PER
    if indices is not None:
        memory.update_priorities(indices, td_errors)

    return loss.item()


# =============================================================================
# EVALUATION
# =============================================================================

def evaluate_agent(policy_net, num_games=100):
    """Run evaluation games without exploration."""
    policy_net.eval()
    scores = []

    for _ in range(num_games):
        env = GameState()
        env.reset()

        while not env.game_over:
            mask = env.get_valid_moves_mask()
            if not np.any(mask):
                break

            state = env.get_observation_vector()
            with torch.no_grad():
                state_t = torch.FloatTensor(state).unsqueeze(0).to(device)
                q_values = policy_net(state_t).cpu().numpy()[0]
                q_values[~mask] = -float('inf')
                action = np.argmax(q_values)

            env.step(action)

        scores.append(env.score)

    policy_net.train()
    return scores


# =============================================================================
# MAIN TRAINING LOOP
# =============================================================================

def train():
    print("=" * 60)
    print("IMPROVED TRAINING CONFIGURATION")
    print("=" * 60)
    print(f"Device: {device}")
    print(f"Episodes: {NUM_EPISODES}")
    print(f"Batch Size: {BATCH_SIZE}")
    print(f"Learning Rate: {LR}")
    print(f"Gamma: {GAMMA}")
    print(f"Memory Size: {MEMORY_SIZE}")
    print(f"Min Memory: {MIN_MEMORY}")
    print(f"Prioritized Replay: {USE_PER}")
    print(f"Soft Updates: {USE_SOFT_UPDATE} (tau={TAU})")
    print(f"LR Scheduler: {USE_LR_SCHEDULER}")
    print("=" * 60)

    # Initialize networks
    policy_net = CNNDuelingDQN(INPUT_SIZE, OUTPUT_SIZE).to(device)
    target_net = CNNDuelingDQN(INPUT_SIZE, OUTPUT_SIZE).to(device)
    target_net.load_state_dict(policy_net.state_dict())
    target_net.eval()

    optimizer = optim.Adam(policy_net.parameters(), lr=LR)

    # Learning rate scheduler
    scheduler = None
    if USE_LR_SCHEDULER:
        scheduler = optim.lr_scheduler.StepLR(
            optimizer,
            step_size=LR_DECAY_STEP,
            gamma=LR_DECAY_GAMMA
        )

    # Replay buffer
    if USE_PER:
        memory = PrioritizedReplayBuffer(MEMORY_SIZE, alpha=PER_ALPHA)
    else:
        memory = UniformReplayBuffer(MEMORY_SIZE)

    # Training stats
    steps_done = 0
    training_scores = []
    losses = []
    best_avg_score = 0
    best_gold_pct = 0

    start_time = time.time()

    print("\nStarting training...\n")

    for i_episode in range(NUM_EPISODES):
        env = GameState()
        state = env.reset()
        episode_loss = []

        while not env.game_over:
            valid_mask = env.get_valid_moves_mask()

            if not np.any(valid_mask):
                break

            # Select action
            action = get_training_action(policy_net, state, valid_mask, steps_done)
            steps_done += 1

            # Execute action
            next_state, reward, done = env.step(action)
            next_valid_mask = env.get_valid_moves_mask()

            # Store transition
            memory.push(state, action, reward, next_state, done, next_valid_mask)
            state = next_state

            # Training step (only if enough samples)
            if len(memory) >= max(BATCH_SIZE, MIN_MEMORY):
                beta = get_beta(i_episode, NUM_EPISODES)
                loss = train_step(policy_net, target_net, optimizer, memory, BATCH_SIZE, beta)
                if loss is not None:
                    episode_loss.append(loss)

                # Target network update
                if USE_SOFT_UPDATE:
                    soft_update(target_net, policy_net, TAU)
                elif steps_done % HARD_UPDATE_STEPS == 0:
                    target_net.load_state_dict(policy_net.state_dict())

        # Record episode stats
        training_scores.append(env.score)
        if episode_loss:
            losses.append(np.mean(episode_loss))

        # Learning rate scheduler step
        if scheduler is not None:
            scheduler.step()

        # Logging
        if i_episode % EVAL_INTERVAL == 0 and i_episode > 0:
            recent_scores = training_scores[-EVAL_INTERVAL:]
            avg_score = np.mean(recent_scores)
            max_score = np.max(recent_scores)
            min_score = np.min(recent_scores)
            std_score = np.std(recent_scores)

            silver_count = sum(1 for s in recent_scores if s >= SCORE_SILVER)
            gold_count = sum(1 for s in recent_scores if s >= SCORE_GOLD)
            silver_pct = silver_count / len(recent_scores) * 100
            gold_pct = gold_count / len(recent_scores) * 100

            avg_loss = np.mean(losses[-100:]) if losses else 0
            eps = get_epsilon(steps_done)
            beta = get_beta(i_episode, NUM_EPISODES)
            current_lr = optimizer.param_groups[0]['lr']

            elapsed = time.time() - start_time
            eps_per_sec = i_episode / elapsed if elapsed > 0 else 0

            # Track best performance
            if avg_score > best_avg_score:
                best_avg_score = avg_score
                torch.save(policy_net.state_dict(), "rl_agent_best_avg.pth")
            if gold_pct > best_gold_pct:
                best_gold_pct = gold_pct
                torch.save(policy_net.state_dict(), "rl_agent_best_gold.pth")

            print(f"Ep {i_episode:5d} | "
                  f"Avg: {avg_score:5.1f} ± {std_score:4.1f} | "
                  f"Min/Max: {min_score:3d}/{max_score:3d} | "
                  f"S: {silver_pct:4.0f}% G: {gold_pct:4.0f}% | "
                  f"Loss: {avg_loss:.4f} | "
                  f"ε: {eps:.3f} | "
                  f"β: {beta:.2f} | "
                  f"LR: {current_lr:.1e} | "
                  f"Mem: {len(memory):6d} | "
                  f"{eps_per_sec:.1f} ep/s")

        # Periodic evaluation (more thorough)
        if i_episode % 5000 == 0 and i_episode > 0:
            print("\n--- Running evaluation (100 games) ---")
            eval_scores = evaluate_agent(policy_net, num_games=100)
            eval_avg = np.mean(eval_scores)
            eval_silver = sum(1 for s in eval_scores if s >= SCORE_SILVER) / 100 * 100
            eval_gold = sum(1 for s in eval_scores if s >= SCORE_GOLD) / 100 * 100
            print(f"Eval Avg: {eval_avg:.1f} | Silver: {eval_silver:.0f}% | Gold: {eval_gold:.0f}%")
            print("-" * 60 + "\n")
            policy_net.train()

    # Final save
    print("\nTraining Complete!")
    print("=" * 60)
    torch.save(policy_net.state_dict(), "rl_agent_final.pth")

    # Final evaluation
    print("\n--- Final Evaluation (500 games) ---")
    eval_scores = evaluate_agent(policy_net, num_games=500)
    eval_avg = np.mean(eval_scores)
    eval_std = np.std(eval_scores)
    eval_silver = sum(1 for s in eval_scores if s >= SCORE_SILVER) / 500 * 100
    eval_gold = sum(1 for s in eval_scores if s >= SCORE_GOLD) / 500 * 100

    print(f"Average Score: {eval_avg:.1f} ± {eval_std:.1f}")
    print(f"Silver Rate: {eval_silver:.1f}%")
    print(f"Gold Rate: {eval_gold:.1f}%")
    print(f"Best Training Avg: {best_avg_score:.1f}")
    print(f"Best Training Gold%: {best_gold_pct:.1f}%")

    return policy_net, training_scores


# =============================================================================
# VALIDATION GAME (verbose)
# =============================================================================

def play_validation_game(policy_net):
    """Play a single verbose game for inspection."""
    print("\n--- Validation Game (Verbose) ---")
    policy_net.eval()

    env = GameState()
    env.reset()

    print(f"Initial Hand: {env.hand}")
    print(f"Board Layout (hidden from agent):")
    print(env.grid_values)
    print()

    move_num = 0
    while not env.game_over:
        mask = env.get_valid_moves_mask()
        if not np.any(mask):
            print("No valid moves!")
            break

        state = env.get_observation_vector()
        with torch.no_grad():
            state_t = torch.FloatTensor(state).unsqueeze(0).to(device)
            q_values = policy_net(state_t).cpu().numpy()[0]
            q_values_display = q_values.copy()
            q_values[~mask] = -float('inf')
            action = np.argmax(q_values)

        r, c = divmod(action, 5)
        board_val = env.grid_values[r][c]
        hand_card = env.hand[0] if env.hand else None
        prev_score = env.score

        obs, reward, done = env.step(action)

        move_num += 1
        result = "WIN" if env.score > prev_score else ("LOSS" if reward < 0 else "DRAW")
        print(f"Move {move_num:2d}: ({r},{c}) | Hand: {hand_card} vs Board: {board_val} | "
              f"{result} | Reward: {reward:+.0f} | Score: {env.score}")

    print(f"\nFinal Score: {env.score}")

    if env.score >= SCORE_GOLD:
        print("🥇 GOLD!")
    elif env.score >= SCORE_SILVER:
        print("🥈 SILVER!")

    return env.score


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    policy_net, scores = train()

    print("\n" + "=" * 60)
    print("Playing 3 validation games:")
    print("=" * 60)

    for i in range(3):
        play_validation_game(policy_net)