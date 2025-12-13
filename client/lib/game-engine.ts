import { shuffle } from "lodash";
import { GameStateResponse, MoveResponse, CellInfo, CARD_K, POINTS } from "@/types";

export class CatchTheKingEngine {
  // Game Constants
  private readonly ROWS = 5;
  private readonly COLS = 5;
  private readonly FULL_DECK_COUNTS: Record<number, number> = { 1: 7, 2: 4, 3: 5, 4: 5, 5: 3, 6: 1 };

  // State
  public gridValues: number[][] = [];
  public gridRevealed: boolean[][] = [];
  public gridKnown: boolean[][] = [];
  public hand: number[] = [];
  public score: number = 0;
  public gameOver: boolean = false;
  public rowsCompleted: boolean[] = [];
  public colsCompleted: boolean[] = [];
  public manualMode: boolean;
  public manualHints: Set<string> = new Set();

  constructor(manualMode: boolean = false) {
    this.manualMode = manualMode;
    this.reset();
  }

  public reset(): void {
    // 1. Initialize Grid
    if (this.manualMode) {
      this.gridValues = Array.from({ length: 5 }, () => Array(5).fill(0));
      this.manualHints = new Set();
    } else {
      const boardDeck: number[] = [];
      Object.entries(this.FULL_DECK_COUNTS).forEach(([card, count]) => {
        for (let i = 0; i < count; i++) boardDeck.push(Number(card));
      });
      const shuffled = shuffle(boardDeck);
      this.gridValues = [];
      for (let r = 0; r < 5; r++) {
        this.gridValues.push(shuffled.slice(r * 5, (r + 1) * 5));
      }
    }

    // 2. Initialize State Arrays
    this.gridRevealed = Array.from({ length: 5 }, () => Array(5).fill(false));
    this.gridKnown = Array.from({ length: 5 }, () => Array(5).fill(false));

    // 3. Initialize Hand (Standard starting hand)
    this.hand = [
      ...Array(5).fill(1),
      ...Array(2).fill(2),
      ...Array(2).fill(3),
      ...Array(1).fill(4),
      ...Array(1).fill(5),
      ...Array(1).fill(6),
    ]; // Already sorted by definition of the Python code list

    this.score = 0;
    this.gameOver = false;
    this.rowsCompleted = Array(5).fill(false);
    this.colsCompleted = Array(5).fill(false);
  }

  // --- Logic Helpers ---

  private getNeighbors(r: number, c: number): [number, number][] {
    const neighbors: [number, number][] = [];
    const rMin = Math.max(0, r - 1);
    const rMax = Math.min(4, r + 1);
    const cMin = Math.max(0, c - 1);
    const cMax = Math.min(4, c + 1);

    for (let nr = rMin; nr <= rMax; nr++) {
      for (let nc = cMin; nc <= cMax; nc++) {
        if (nr === r && nc === c) continue;
        neighbors.push([nr, nc]);
      }
    }
    return neighbors;
  }

  // --- Observation Logic (Ported from game.py) ---

  private computeTriangulation() {
    const definitelyNot5 = Array.from({ length: 5 }, () => Array(5).fill(false));
    const hintSources: [number, number][] = [];
    const noHintSources: [number, number][] = [];

    // Pass 1: Identify hint sources
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (this.gridRevealed[r][c] || this.gridKnown[r][c]) {
          if (this.manualMode) {
            if (this.manualHints.has(`${r},${c}`)) hintSources.push([r, c]);
            else noHintSources.push([r, c]);
          } else {
            let found5 = false;
            for (const [nr, nc] of this.getNeighbors(r, c)) {
              if (this.gridValues[nr][nc] === 5) {
                found5 = true;
                break;
              }
            }
            if (found5) hintSources.push([r, c]);
            else noHintSources.push([r, c]);
          }
        }
      }
    }

    // Pass 2: Mark cells DEFINITELY NOT 5
    for (const [r, c] of noHintSources) {
      for (const [nr, nc] of this.getNeighbors(r, c)) {
        definitelyNot5[nr][nc] = true;
      }
    }

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (this.gridRevealed[r][c] || this.gridKnown[r][c]) {
          if (this.gridValues[r][c] !== 5) {
            definitelyNot5[r][c] = true;
          }
        }
      }
    }

    // Pass 3: Constrained 5 locations
    const constrainedRegions: Set<string>[] = [];
    for (const [hr, hc] of hintSources) {
      const neighbors = this.getNeighbors(hr, hc);
      const candidateCells = new Set<string>();

      for (const [nr, nc] of neighbors) {
        if (!this.gridRevealed[nr][nc]) {
          if (this.gridKnown[nr][nc]) {
            if (this.gridValues[nr][nc] === 5) candidateCells.add(`${nr},${nc}`);
          } else {
            if (!definitelyNot5[nr][nc]) candidateCells.add(`${nr},${nc}`);
          }
        }
      }
      if (candidateCells.size > 0) constrainedRegions.push(candidateCells);
    }

    // Pass 4: High Prob 5
    const highProb5 = Array.from({ length: 5 }, () => Array(5).fill(0.0));
    if (constrainedRegions.length > 0) {
      const appearanceCount: Record<string, number> = {};
      let maxAppearances = 1;

      for (const region of constrainedRegions) {
        for (const cellStr of region) {
          appearanceCount[cellStr] = (appearanceCount[cellStr] || 0) + 1;
          if (appearanceCount[cellStr] > maxAppearances) maxAppearances = appearanceCount[cellStr];
        }
      }

      Object.entries(appearanceCount).forEach(([cellStr, count]) => {
        const [r, c] = cellStr.split(',').map(Number);
        highProb5[r][c] = count / maxAppearances;
      });

      for (const region of constrainedRegions) {
        if (region.size === 1) {
          const [r, c] = Array.from(region)[0].split(',').map(Number);
          highProb5[r][c] = 1.0;
        }
      }
    }

    return { definitelyNot5, highProb5, hintSources };
  }

  public getObservationVector(): Float32Array {
    // 1. Calculate Remaining Deck
    const currentBoardCounts = { ...this.FULL_DECK_COUNTS };
    const unknownIndices: [number, number][] = [];

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (this.gridRevealed[r][c] || this.gridKnown[r][c]) {
          const val = this.gridValues[r][c];
          if (val > 0) {
            currentBoardCounts[val] = Math.max(0, currentBoardCounts[val] - 1);
          }
        } else {
          unknownIndices.push([r, c]);
        }
      }
    }

    const totalUnknown = unknownIndices.length;

    // 2. Advanced Constraint Logic
    const { definitelyNot5, highProb5, hintSources } = this.computeTriangulation();

    // 3. Build refined probability map for 5s
    const prob5Map = Array.from({ length: 5 }, () => Array(5).fill(0.0));
    const possible5s = currentBoardCounts[5];
    const potential5Cells = unknownIndices.filter(([r, c]) => !definitelyNot5[r][c]);
    const numPotential = potential5Cells.length;

    let baseProb5 = 0.0;
    if (numPotential > 0 && possible5s > 0) {
      baseProb5 = Math.min(1.0, possible5s / numPotential);
    }

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (this.gridRevealed[r][c]) {
          prob5Map[r][c] = 0.0;
        } else if (this.gridKnown[r][c]) {
          prob5Map[r][c] = this.gridValues[r][c] === 5 ? 1.0 : 0.0;
        } else {
          if (definitelyNot5[r][c]) prob5Map[r][c] = 0.0;
          else if (highProb5[r][c] > 0) prob5Map[r][c] = Math.max(baseProb5, highProb5[r][c]);
          else prob5Map[r][c] = baseProb5;
        }
      }
    }

    // 4. Build Active Hint Map
    const activeHintMap = Array.from({ length: 5 }, () => Array(5).fill(0.0));
    for (const [r, c] of hintSources) activeHintMap[r][c] = 1.0;

    // 5. Build Channels
    // Channels: 0:State, 1:WinProb, 2:Prob5, 3:ProbK, 4:HintSource, 5:Not5
    const gridObs = Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => Array(5).fill(0.0)));
    const currentHandCard = this.hand.length > 0 ? this.hand[0] : 0;

    let winsInDeck = 0;
    Object.entries(currentBoardCounts).forEach(([valStr, count]) => {
      const val = Number(valStr);
      if (currentHandCard === CARD_K) {
        if (val === CARD_K) winsInDeck += count;
      } else {
        if (val >= currentHandCard) winsInDeck += count;
      }
    });

    const probWinBase = totalUnknown > 0 ? winsInDeck / totalUnknown : 0;

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        // Channel 0: Board State
        if (this.gridRevealed[r][c]) gridObs[0][r][c] = 0.0;
        else if (this.gridKnown[r][c]) gridObs[0][r][c] = this.gridValues[r][c] / 6.0;
        else gridObs[0][r][c] = -1.0;

        // Channel 5: Definitely NOT 5
        gridObs[5][r][c] = definitelyNot5[r][c] ? 1.0 : 0.0;

        // Logic for hidden/unknown vs known
        if (!this.gridRevealed[r][c] && !this.gridKnown[r][c]) {
          // Unknown
          gridObs[2][r][c] = prob5Map[r][c];
          gridObs[3][r][c] = currentBoardCounts[CARD_K] > 0 ? 1.0 / totalUnknown : 0.0;
          gridObs[1][r][c] = probWinBase;
        } else if (this.gridKnown[r][c] && !this.gridRevealed[r][c]) {
          // Known
          const val = this.gridValues[r][c];
          gridObs[2][r][c] = val === 5 ? 1.0 : 0.0;
          gridObs[3][r][c] = val === CARD_K ? 1.0 : 0.0;
          if (currentHandCard === CARD_K) {
            gridObs[1][r][c] = val === CARD_K ? 1.0 : 0.0;
          } else {
            gridObs[1][r][c] = val >= currentHandCard ? 1.0 : 0.0;
          }
        }

        // Channel 4: Hint Source
        gridObs[4][r][c] = activeHintMap[r][c];
      }
    }

    // Flatten logic
    const flatGrid: number[] = [];
    for (let ch = 0; ch < 6; ch++) {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          flatGrid.push(gridObs[ch][r][c]);
        }
      }
    }

    const handScalar = [currentHandCard / 6.0];
    const deckScalar = [];
    for (let k = 1; k <= 6; k++) {
      deckScalar.push(currentBoardCounts[k] / 25.0);
    }

    return new Float32Array([...flatGrid, ...handScalar, ...deckScalar]);
  }

  // --- Move Logic ---

  public applyManualInput(row: number, col: number, actualValue: number, hasHint: boolean): MoveResponse {
    const playerCard = this.hand.length ? this.hand[0] : null;

    // Update Truth
    this.gridValues[row][col] = actualValue;
    if (hasHint) this.manualHints.add(`${row},${col}`);

    const info: any = {
      hand_popped: false,
      re_hidden: false,
      popped_card: playerCard,
      show_hint: hasHint
    };

    if (playerCard === null) return this.finalizeMove(info);

    // 1. Suicide Check
    if (this.gridKnown[row][col] && playerCard < actualValue) {
      if (!(playerCard === CARD_K && actualValue === CARD_K)) {
        this.hand.shift();
        info.hand_popped = true;
        info.re_hidden = true;
        if (this.hand.length === 0) this.gameOver = true;
        return this.finalizeMove(info);
      }
    }

    // 2. Capture Check (Manual Mode simplification)
    let captured = false;
    if (playerCard === 5 && hasHint) {
      captured = true;
    }

    if (captured) {
      this.hand.shift();
      info.hand_popped = true;
      info.re_hidden = true;
    } else {
      // 3. Reveal and Compare
      this.gridKnown[row][col] = true;

      if (playerCard === CARD_K) {
        this.gridRevealed[row][col] = true;
        if (actualValue === CARD_K) {
          this.score += 100;
          this.hand.shift();
          info.hand_popped = true;
        } else {
          this.gameOver = true;
        }
      } else {
        const points = POINTS[actualValue];
        if (playerCard > actualValue) {
          this.score += points;
          this.gridRevealed[row][col] = true;
        } else if (playerCard === actualValue) {
          this.score += points;
          this.hand.shift();
          this.gridRevealed[row][col] = true;
          info.hand_popped = true;
        } else {
          this.hand.shift();
          this.gridRevealed[row][col] = false;
          info.hand_popped = true;
          info.re_hidden = true;
        }
      }

      // 4. Bonuses
      if (this.gridRevealed[row][col] && !this.gameOver) {
        this.checkBonuses(row, col);
      }
    }

    if (this.hand.length === 0) this.gameOver = true;
    return this.finalizeMove(info);
  }

  public applyMove(row: number, col: number): MoveResponse {
    if (this.manualMode) throw new Error("Use applyManualInput in manual mode");

    const playerCard = this.hand.length ? this.hand[0] : null;
    const boardCard = this.gridValues[row][col];

    let showHint = false;
    for (const [nr, nc] of this.getNeighbors(row, col)) {
      if (this.gridValues[nr][nc] === 5) {
        showHint = true;
        break;
      }
    }

    const info: any = {
      hand_popped: false,
      re_hidden: false,
      popped_card: playerCard,
      show_hint: showHint
    };

    if (playerCard === null) return this.finalizeMove(info);

    // Suicide Check
    if (this.gridKnown[row][col] && playerCard < boardCard) {
      if (!(playerCard === CARD_K && boardCard === CARD_K)) {
        this.hand.shift();
        info.hand_popped = true;
        info.re_hidden = true;
        if (this.hand.length === 0) this.gameOver = true;
        return this.finalizeMove(info);
      }
    }

    // Capture Check
    let captured = false;
    if (playerCard === 5) {
      for (const [nr, nc] of this.getNeighbors(row, col)) {
        if (!this.gridRevealed[nr][nc] && this.gridValues[nr][nc] === 5) {
          captured = true;
          break;
        }
      }
    }

    if (captured) {
      this.hand.shift();
      info.hand_popped = true;
      info.re_hidden = true;
    } else {
      this.gridKnown[row][col] = true;

      if (playerCard === CARD_K) {
        this.gridRevealed[row][col] = true;
        if (boardCard === CARD_K) {
          this.score += 100;
          this.hand.shift();
          info.hand_popped = true;
        } else {
          this.gameOver = true;
        }
      } else {
        const points = POINTS[boardCard];
        if (playerCard > boardCard) {
          this.score += points;
          this.gridRevealed[row][col] = true;
        } else if (playerCard === boardCard) {
          this.score += points;
          this.hand.shift();
          this.gridRevealed[row][col] = true;
          info.hand_popped = true;
        } else {
          this.hand.shift();
          this.gridRevealed[row][col] = false;
          info.hand_popped = true;
          info.re_hidden = true;
        }
      }

      if (this.gridRevealed[row][col] && !this.gameOver) {
        this.checkBonuses(row, col);
      }
    }

    if (this.hand.length === 0) this.gameOver = true;
    return this.finalizeMove(info);
  }

  private checkBonuses(r: number, c: number) {
    let bPts = 0;

    // Check Row
    if (!this.rowsCompleted[r]) {
      let allRevealed = true;
      for (let i = 0; i < 5; i++) if (!this.gridRevealed[r][i]) allRevealed = false;
      if (allRevealed) {
        bPts += 10;
        this.rowsCompleted[r] = true;
      }
    }

    // Check Col
    if (!this.colsCompleted[c]) {
      let allRevealed = true;
      for (let i = 0; i < 5; i++) if (!this.gridRevealed[i][c]) allRevealed = false;
      if (allRevealed) {
        bPts += 10;
        this.colsCompleted[c] = true;
      }
    }
    this.score += bPts;
  }

  private finalizeMove(info: any): MoveResponse {
    return {
      success: true,
      hand_popped: info.hand_popped,
      re_hidden: info.re_hidden,
      show_hint: info.show_hint,
      game_over: this.gameOver,
      score: this.score
    };
  }

  public getValidMovesMask(): boolean[] {
    const mask = Array(25).fill(false);
    if (this.gameOver) return mask;

    const currentCard = this.hand.length ? this.hand[0] : 0;
    let unknownExist = false;

    // Check if any unknown cards exist
    for (let i = 0; i < 25; i++) {
        const r = Math.floor(i / 5);
        const c = i % 5;
        if (!this.gridKnown[r][c] && !this.gridRevealed[r][c]) {
            unknownExist = true;
            break;
        }
    }

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const i = r * 5 + c;
        if (this.gridRevealed[r][c]) {
          mask[i] = false;
          continue;
        }

        if (this.gridKnown[r][c]) {
          const boardVal = this.gridValues[r][c];
          if (currentCard === CARD_K) {
            mask[i] = (boardVal === CARD_K);
          } else if (boardVal > currentCard) {
            // If unknown exist, we shouldn't suicide on known larger cards
            if (unknownExist) mask[i] = false;
            else mask[i] = true;
          } else {
            mask[i] = true;
          }
        } else {
          mask[i] = true;
        }
      }
    }

    // Fallback if no moves
    if (!mask.some(m => m)) {
       for(let i=0; i<25; i++) {
           const r = Math.floor(i / 5);
           const c = i % 5;
           if (!this.gridRevealed[r][c]) mask[i] = true;
       }
    }

    return mask;
  }

  public getGameStateResponse(): GameStateResponse {
    const grid: CellInfo[][] = [];
    for (let r = 0; r < 5; r++) {
      const row: CellInfo[] = [];
      for (let c = 0; c < 5; c++) {
        let showValue = this.gridRevealed[r][c] || this.gridKnown[r][c];

        // Logic: Show all if game over (only in auto mode)
        if (this.gameOver && !this.manualMode) showValue = true;

        let val = (showValue) ? this.gridValues[r][c] : null;
        if (val === 0) val = null; // Hide initialized zeros in manual mode

        row.push({
          value: val,
          revealed: this.gridRevealed[r][c],
          known: this.gridKnown[r][c]
        });
      }
      grid.push(row);
    }

    const validMoves: number[][] = [];
    if (!this.gameOver) {
       for(let r=0; r<5; r++) {
           for(let c=0; c<5; c++) {
               if (!this.gridRevealed[r][c]) validMoves.push([r, c]);
           }
       }
    }

    return {
      grid,
      hand: [...this.hand],
      current_card: this.hand.length ? this.hand[0] : null,
      score: this.score,
      game_over: this.gameOver,
      rows_completed: [...this.rowsCompleted],
      cols_completed: [...this.colsCompleted],
      valid_moves: validMoves,
      is_manual: this.manualMode
    };
  }
}