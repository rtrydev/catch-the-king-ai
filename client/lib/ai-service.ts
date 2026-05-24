import * as ort from "onnxruntime-web";
import { CatchTheKingEngine } from "./game-engine";
import { HintResponse } from "@/types";

const INPUT_SIZE = 157; // 150 grid features + 7 scalars

let session: ort.InferenceSession | null = null;

/**
 * Loads the ONNX model from the public directory.
 */
export async function loadModel(modelPath: string = "/model.onnx") {
  if (session) return;
  try {
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["wasm"],
    });
    console.log("Catch the King AI Model loaded successfully");
  } catch (e) {
    console.error("Failed to load ONNX model", e);
    throw e;
  }
}

/**
 * Gets a hint for the current game state using the loaded model.
 */
export async function getHint(game: CatchTheKingEngine): Promise<HintResponse> {
  if (!session) {
    await loadModel();
  }
  if (!session) throw new Error("Model failed to load");
  if (game.gameOver) throw new Error("Game is over");

  // 1. Get input vector
  const inputVector = game.getObservationVector(); // Float32Array size 157

  // 2. Prepare Tensor
  // Shape is [1, 157]
  const tensor = new ort.Tensor("float32", inputVector, [1, INPUT_SIZE]);

  // 3. Run Inference
  // Note: 'input' must match the input node name in your ONNX file.
  // PyTorch export usually names it 'input.1' or 'input', check your model if this fails.
  // We try generic inputs or assume the first input name.
  const inputName = session.inputNames[0];
  const feeds: Record<string, ort.Tensor> = { [inputName]: tensor };

  const results = await session.run(feeds);
  const outputName = session.outputNames[0];
  const rawOutput = results[outputName].data as Float32Array; // Size 25
  // Copy to a mutable array we can adjust with the safety penalty.
  const outputData = Array.from(rawOutput);

  // Safety layer: when P=[5] is active and any cell would be a guaranteed
  // capture (face-down known-[5] neighbor), push those Q-values down so the
  // model can never pick a known capture trap when a safe alternative is
  // legal. Uniform penalty preserves the model's ordering inside the
  // all-capture edge case.
  const capturePenalty = game.getCapturePenaltyMask();
  for (let i = 0; i < 25; i++) {
    if (capturePenalty[i]) outputData[i] -= 1000;
  }

  // 4. Mask Invalid Moves
  const validMask = game.getValidMovesMask();
  const validIndices: number[] = [];

  // Collect valid indices
  validMask.forEach((isValid, idx) => {
    if (isValid) validIndices.push(idx);
  });

  // If strict masking left no moves, fallback to any unrevealed
  if (validIndices.length === 0) {
    for (let r=0; r<5; r++) {
        for (let c=0; c<5; c++) {
            if(!game.gridRevealed[r][c]) validIndices.push(r*5+c);
        }
    }
  }

  // 5. Rank Moves
  const movesRanked = [];
  for (const idx of validIndices) {
      const r = Math.floor(idx / 5);
      const c = idx % 5;
      movesRanked.push({
          row: r,
          col: c,
          q_value: outputData[idx]
      });
  }

  // Sort descending by Q-value
  movesRanked.sort((a, b) => b.q_value - a.q_value);

  if (movesRanked.length === 0) throw new Error("No valid moves available");

  const bestMove = movesRanked[0];

  // Calculate confidence (simple diff between 1st and 2nd choice)
  let confidence = 1.0;
  if (movesRanked.length > 1) {
      const qDiff = bestMove.q_value - movesRanked[1].q_value;
      confidence = Math.min(1.0, Math.max(0.0, qDiff / 10.0 + 0.5));
  }

  return {
      recommended_move: [bestMove.row, bestMove.col],
      confidence,
      all_moves_ranked: movesRanked
  };
}