import { useEffect, useRef, useState } from 'react';
import { SCORE_GOLD, SCORE_SILVER } from '@/lib/constants';

interface HoverData {
  index: number;
  score: number;
  x: number;
  y: number;
}

export function useChartCanvas(scores: number[], isActiveMode: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredData, setHoveredData] = useState<HoverData | null>(null);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActiveMode || scores.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    // Dimensions (must match Draw logic)
    const padding = 20 * (window.devicePixelRatio || 1);
    const topChartHeight = canvas.height / 2 - padding;

    // Only interact with the Top Chart (Timeline)
    if (mouseY > topChartHeight + padding) {
      setHoveredData(null);
      return;
    }

    const graphW = canvas.width - padding * 2;
    const barWidth = graphW / scores.length;

    if (mouseX >= padding && mouseX <= canvas.width - padding) {
      const index = Math.floor((mouseX - padding) / barWidth);
      if (index >= 0 && index < scores.length) {
        setHoveredData({
          index,
          score: scores[index],
          x: mouseX / scaleX,
          y: mouseY / scaleY,
        });
        return;
      }
    }
    setHoveredData(null);
  };

  const handleCanvasMouseLeave = () => setHoveredData(null);

  useEffect(() => {
    if (!isActiveMode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const w = canvas.width;
    const h = canvas.height;
    const p = 20 * dpr;

    // Colors
    const cBarGold = '#eab308';
    const cBarSilver = '#94a3b8';
    const cBarBlue = '#60a5fa';
    const cText = '#94a3b8';

    ctx.clearRect(0, 0, w, h);

    if (scores.length === 0) {
      ctx.fillStyle = cText;
      ctx.font = `${16 * dpr}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Ready to Evaluate', w / 2, h / 2);
      return;
    }

    // --- 1. TOP CHART: Game Timeline ---
    const topH = h / 2 - p * 1.5;
    const topY = p;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, topH + p, 12 * dpr);
    ctx.fill();

    // Title
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${12 * dpr}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`GAME TIMELINE (LAST ${scores.length})`, p, p * 1.5);

    const tGraphX = p;
    const tGraphY = p * 2.5;
    const tGraphW = w - p * 2;
    const tGraphH = topH - p * 1.5;
    const maxValTimeline = Math.max(650, ...scores);
    const barW = tGraphW / scores.length;

    // Draw Bars
    scores.forEach((score, i) => {
      const bh = (score / maxValTimeline) * tGraphH;
      const bx = tGraphX + i * barW;
      const by = tGraphY + tGraphH - bh;

      if (score >= SCORE_GOLD) ctx.fillStyle = cBarGold;
      else if (score >= SCORE_SILVER) ctx.fillStyle = cBarSilver;
      else ctx.fillStyle = cBarBlue;

      if (hoveredData?.index === i) {
        ctx.fillStyle = '#ffffff';
      }

      ctx.fillRect(bx, by, Math.max(barW - 1 * dpr, 0.5 * dpr), bh);
    });

    // Thresholds
    const drawThreshold = (val: number, color: string, labelColor: string) => {
        const yVal = tGraphY + tGraphH - ((val / maxValTimeline) * tGraphH);
        ctx.strokeStyle = color;
        if(val === SCORE_SILVER) ctx.setLineDash([4 * dpr, 4 * dpr]);
        else ctx.setLineDash([]);
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(tGraphX, yVal);
        ctx.lineTo(tGraphX + tGraphW, yVal);
        ctx.stroke();

        ctx.fillStyle = labelColor;
        ctx.font = `bold ${10 * dpr}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`${val}`, w - p, yVal - 4);
    }

    drawThreshold(SCORE_SILVER, 'rgba(148, 163, 184, 0.5)', '#94a3b8');
    drawThreshold(SCORE_GOLD, 'rgba(234, 179, 8, 0.4)', '#eab308');
    ctx.setLineDash([]);

    // --- 2. BOTTOM CHART: Score Distribution ---
    const botY = topH + p * 2.5;
    const botH = h - botY - p;

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(0, botY - p, w, botH + p * 2, 12 * dpr);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${12 * dpr}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('SCORE DISTRIBUTION', p, botY);

    const binSize = 10;
    const rawMin = Math.min(...scores);
    const rawMax = Math.max(...scores);
    const minScore = Math.floor(rawMin / binSize) * binSize;
    const maxScore = Math.max(Math.ceil(rawMax / binSize) * binSize, minScore + binSize * 10);

    const bins: Record<number, number> = {};
    let maxFreq = 0;
    scores.forEach((s) => {
      const b = Math.floor(s / binSize) * binSize;
      bins[b] = (bins[b] || 0) + 1;
      maxFreq = Math.max(maxFreq, bins[b]);
    });

    const bGraphX = p;
    const bGraphY = botY + p;
    const bGraphW = w - p * 2;
    const bGraphH = botH - p * 2;

    const totalBins = (maxScore - minScore) / binSize;
    const safeTotalBins = totalBins < 1 ? 1 : totalBins + 1;
    const histBarW = bGraphW / safeTotalBins;

    for (let b = minScore; b <= maxScore; b += binSize) {
      const freq = bins[b] || 0;
      const hBarH = maxFreq > 0 ? (freq / maxFreq) * bGraphH : 0;
      const bIdx = (b - minScore) / binSize;
      const bx = bGraphX + bIdx * histBarW;
      const by = bGraphY + bGraphH - hBarH;

      if (b >= SCORE_GOLD) ctx.fillStyle = cBarGold;
      else if (b >= SCORE_SILVER) ctx.fillStyle = cBarSilver;
      else ctx.fillStyle = cBarBlue;

      const bw = Math.max(histBarW - 2 * dpr, 1);
      ctx.beginPath();
      if (hBarH > 0) ctx.roundRect(bx, by, bw, hBarH, [4 * dpr, 4 * dpr, 0, 0]);
      else ctx.rect(bx, bGraphY + bGraphH - 1, bw, 1);
      ctx.fill();

      // Axis Labels
      const labelStep = totalBins > 20 ? 5 : totalBins > 10 ? 2 : 1;
      const currentBinIdx = (b - minScore) / binSize;
      if (currentBinIdx % labelStep === 0) {
        ctx.save();
        ctx.translate(bx + bw / 2, bGraphY + bGraphH + 10 * dpr);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'right';
        ctx.font = `${9 * dpr}px sans-serif`;
        ctx.fillText(b.toString(), 0, 0);
        ctx.restore();
      }
    }
  }, [scores, isActiveMode, hoveredData]);

  return { canvasRef, hoveredData, handleCanvasMouseMove, handleCanvasMouseLeave };
}