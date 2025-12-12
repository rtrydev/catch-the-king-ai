import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
from collections import deque
import math

from game import INPUT_SIZE, OUTPUT_SIZE, GameState, SCORE_GOLD, SCORE_SILVER

# --- Config ---
BATCH_SIZE = 128
GAMMA = 0.99
EPS_START = 1.0
EPS_END = 0.01
LR = 1e-4
TARGET_UPDATE = 400
MEMORY_SIZE = 100000
NUM_EPISODES = 20000
EPS_DECAY = 2 * NUM_EPISODES

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- Improved Architecture: CNN Dueling DQN ---

class CNNDuelingDQN(nn.Module):
    def __init__(self, input_dim, output_dim):
        super(CNNDuelingDQN, self).__init__()

        # Input is 443 floats.
        # Part 1: Grid -> 25 cells * 17 features = 425
        # Part 2: Scalars -> 18

        self.grid_features = 17
        self.grid_total_size = 25 * self.grid_features # 425

        # Spatial Processing (CNN)
        self.conv_layer = nn.Sequential(
            nn.Conv2d(self.grid_features, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Flatten()
        )

        # 128 channels * 5 * 5 grid = 3200
        cnn_out_size = 128 * 5 * 5
        scalar_input_size = 18

        combined_size = cnn_out_size + scalar_input_size

        # Feature Merger
        self.fc_layer = nn.Sequential(
            nn.Linear(combined_size, 512),
            nn.ReLU()
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
        # x shape: [batch_size, 443]

        # 1. Split Input
        # First 425 are the grid
        board_part = x[:, :self.grid_total_size]
        scalar_part = x[:, self.grid_total_size:]

        # 2. Reshape for CNN [Batch, Channels, Height, Width]
        batch_size = x.size(0)
        board_reshaped = board_part.view(batch_size, 5, 5, self.grid_features).permute(0, 3, 1, 2)

        # 3. Process
        cnn_out = self.conv_layer(board_reshaped)

        # 4. Concatenate with scalars
        combined = torch.cat((cnn_out, scalar_part), dim=1)

        # 5. Dueling Heads
        features = self.fc_layer(combined)
        values = self.value_stream(features)
        advantages = self.advantage_stream(features)

        qvals = values + (advantages - advantages.mean(dim=1, keepdim=True))
        return qvals

class ReplayBuffer:
    def __init__(self, capacity):
        self.buffer = deque(maxlen=capacity)
    def push(self, state, action, reward, next_state, done, mask):
        self.buffer.append((state, action, reward, next_state, done, mask))
    def sample(self, batch_size):
        batch = random.sample(self.buffer, batch_size)
        state, action, reward, next_state, done, mask = zip(*batch)
        return state, action, reward, next_state, done, mask
    def __len__(self): return len(self.buffer)

class RLAgent:
    def __init__(self):
        self.policy_net = CNNDuelingDQN(INPUT_SIZE, OUTPUT_SIZE).to(device)
        self.policy_net.eval()

    def select_move(self, game_state, training=False):
        mask = game_state.get_valid_moves_mask()
        state = game_state.get_observation_vector()

        valid_indices = np.where(mask)[0]
        if len(valid_indices) == 0:
            return None, None, None

        with torch.no_grad():
            state_t = torch.FloatTensor(state).unsqueeze(0).to(device)
            q_values = self.policy_net(state_t).cpu().numpy()[0]
            q_values[~mask] = -float('inf')
            action = np.argmax(q_values)

        r, c = divmod(action, 5)
        return (r, c), action, q_values

if __name__ == "__main__":
    agent = RLAgent()
    policy_net = agent.policy_net
    policy_net.train()

    target_net = CNNDuelingDQN(INPUT_SIZE, OUTPUT_SIZE).to(device)
    target_net.load_state_dict(policy_net.state_dict())
    target_net.eval()

    optimizer = optim.Adam(policy_net.parameters(), lr=LR)
    memory = ReplayBuffer(MEMORY_SIZE)

    def get_training_action(state, valid_mask, steps_done):
        sample = random.random()
        eps_threshold = EPS_END + (EPS_START - EPS_END) * math.exp(-1. * steps_done / EPS_DECAY)

        if sample < eps_threshold:
            valid_indices = np.where(valid_mask)[0]
            if len(valid_indices) == 0: return 0
            return random.choice(valid_indices)

        with torch.no_grad():
            state_t = torch.FloatTensor(state).unsqueeze(0).to(device)
            q_values = policy_net(state_t).cpu().numpy()[0]
            q_values[~valid_mask] = -float('inf')
            return np.argmax(q_values)

    print(f"Training CNN-Dueling DQN on {device}...")
    steps_done = 0
    scores = []

    for i_episode in range(NUM_EPISODES):
        env = GameState()
        state = env.reset()

        while not env.game_over:
            valid_mask = env.get_valid_moves_mask()

            # Safety: If no valid moves (shouldn't happen with logic, but safety first)
            if not np.any(valid_mask):
                break

            action = get_training_action(state, valid_mask, steps_done)
            steps_done += 1

            next_state, reward, done = env.step(action)
            next_valid_mask = env.get_valid_moves_mask()

            memory.push(state, action, reward, next_state, done, next_valid_mask)
            state = next_state

            if len(memory) >= BATCH_SIZE:
                batch_state, batch_action, batch_reward, batch_next_state, batch_done, batch_next_mask = memory.sample(BATCH_SIZE)

                b_state = torch.FloatTensor(np.array(batch_state)).to(device)
                b_action = torch.LongTensor(batch_action).unsqueeze(1).to(device)
                b_reward = torch.FloatTensor(batch_reward).unsqueeze(1).to(device)
                b_next = torch.FloatTensor(np.array(batch_next_state)).to(device)
                b_done = torch.FloatTensor(batch_done).unsqueeze(1).to(device)

                # Double DQN Logic
                with torch.no_grad():
                    # Select action with Policy Net
                    policy_next_q = policy_net(b_next)

                    # Apply mask to selection (very important)
                    b_mask_t = torch.tensor(np.array(batch_next_mask), dtype=torch.bool).to(device)
                    policy_next_q[~b_mask_t] = -float('inf')

                    best_action = policy_next_q.argmax(1).unsqueeze(1)

                    # Evaluate with Target Net
                    target_next_q = target_net(b_next).gather(1, best_action)
                    expected_q = b_reward + (GAMMA * target_next_q * (1 - b_done))

                curr_q = policy_net(b_state).gather(1, b_action)
                loss = nn.SmoothL1Loss()(curr_q, expected_q)

                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(policy_net.parameters(), 1.0)
                optimizer.step()

        if i_episode % TARGET_UPDATE == 0:
            target_net.load_state_dict(policy_net.state_dict())

        scores.append(env.score)

        if i_episode % 100 == 0:
            recent_scores = scores[-100:]
            avg = np.mean(recent_scores)
            max_score = np.max(recent_scores)

            silver_pct = (sum(1 for s in recent_scores if s >= SCORE_SILVER) / 100) * 100
            gold_pct = (sum(1 for s in recent_scores if s >= SCORE_GOLD) / 100) * 100

            eps = EPS_END + (EPS_START - EPS_END) * math.exp(-1. * steps_done / EPS_DECAY)

            print(f"Ep {i_episode} | Avg: {avg:.1f} | Max: {max_score} | S: {silver_pct:.0f}% | G: {gold_pct:.0f}% | Eps: {eps:.2f}")

    print("Training Complete.")
    torch.save(policy_net.state_dict(), "rl_agent.pth")

    # --- Validation ---
    print("\n--- Validation Game ---")
    env = GameState()
    agent.policy_net.eval()
    print(f"Hand: {env.hand}")
    while not env.game_over:
        (r, c), action, _ = agent.select_move(env, training=False)
        if action is None: break
        obs, rew, done = env.step(action)
        print(f"Move ({r},{c}) -> Val {env.grid_values[r][c]} -> Score {env.score}")
    print(f"Final Score: {env.score}")