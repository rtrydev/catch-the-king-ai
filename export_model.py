import torch
import onnx
from game import OUTPUT_SIZE
from train import INPUT_SIZE, CNNDuelingDQN, device

model = CNNDuelingDQN(INPUT_SIZE, OUTPUT_SIZE).to(device)

try:
    model.load_state_dict(torch.load("rl_agent_best_gold.pth", map_location=device, weights_only=True))

    print("Weights loaded.")
except FileNotFoundError:
    print("Error: rl_agent.pth not found. Train the model first.")
    exit()

model.eval()

dummy_input = torch.randn(1, INPUT_SIZE, device=device)

temp_path = "temp_model.onnx"
torch.onnx.export(
    model,
    dummy_input,
    temp_path,
    verbose=False,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
)

print("Optimizing for web (inlining weights)...")
onnx_model = onnx.load(temp_path)
final_path = "model.onnx"

onnx.save(onnx_model, final_path)

print(f"Success! Model exported to '{final_path}'")
print("Please ensure you delete any old .data files in your public folder.")