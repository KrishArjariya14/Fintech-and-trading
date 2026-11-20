import React, { useEffect, useRef, useState } from 'react';
import type { Candle, Timeframe } from '../types/trading';

interface CandlestickChartProps {
  symbol: string;
  candles: Candle[];
  currentPrice: number;
  decimals: number;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  isDark: boolean;
  showSma20: boolean;
  showEma9: boolean;
  showBollinger: boolean;
  onToggleIndicator: (indicator: 'sma20' | 'ema9' | 'bollinger') => void;
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '1h', '1D'];

function computeSma(values: number[], period: number): (number | null)[] {
  return values.map((_, idx) => {
    if (idx < period - 1) return null;
    let sum = 0;
    for (let j = idx - period + 1; j <= idx; j++) sum += values[j];
    return sum / period;
  });
}

function computeEma(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const res: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      res.push(null);
      continue;
    }
    if (prev === null) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    res.push(prev);
  }
  return res;
}

function computeBollinger(values: number[], period = 20, mult = 2): { upper: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { upper, lower };
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  symbol,
  candles,
  currentPrice,
  decimals,
  timeframe,
  onTimeframeChange,
  isDark,
  showSma20,
  showEma9,
  showBollinger,
  onToggleIndicator,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 760, height: 420 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        const h = Math.max(340, Math.floor(entry.contentRect.height));
        setSize({ width: w, height: h });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleCandles = candles.slice(-72);
  const inspectedCandle =
    hoverIndex !== null && visibleCandles[hoverIndex]
      ? visibleCandles[hoverIndex]
      : visibleCandles[visibleCandles.length - 1];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || visibleCandles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.width, size.height);

    const padLeft = 12;
    const padRight = 76;
    const padTop = 18;
    const padBottom = 28;
    const volHeight = 56;
    const chartWidth = size.width - padLeft - padRight;
    const priceHeight = size.height - padTop - padBottom - volHeight - 10;

    const closes = visibleCandles.map((c) => c.close);
    const sma20 = showSma20 ? computeSma(closes, 20) : [];
    const ema9 = showEma9 ? computeEma(closes, 9) : [];
    const boll = showBollinger ? computeBollinger(closes, 20, 2) : null;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    visibleCandles.forEach((c, idx) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
      if (boll?.upper[idx] && boll.upper[idx]! > maxPrice) maxPrice = boll.upper[idx]!;
      if (boll?.lower[idx] && boll.lower[idx]! < minPrice) minPrice = boll.lower[idx]!;
    });

    if (currentPrice < minPrice) minPrice = currentPrice;
    if (currentPrice > maxPrice) maxPrice = currentPrice;

    const priceRange = Math.max(maxPrice - minPrice, currentPrice * 0.002);
    minPrice -= priceRange * 0.08;
    maxPrice += priceRange * 0.08;
    const effectiveRange = maxPrice - minPrice;

    const yForPrice = (p: number) =>
      padTop + ((maxPrice - p) / effectiveRange) * priceHeight;

    const gridColor = isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.07)';
    const textColor = isDark ? '#94A3B8' : '#64748B';
    const bullColor = '#16A34A';
    const bearColor = '#DC2626';

    // Horizontal grid & price labels
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const priceVal = minPrice + (effectiveRange * i) / gridSteps;
      const y = Math.round(yForPrice(priceVal)) + 0.5;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.fillText(priceVal.toFixed(decimals), padLeft + chartWidth + 8, y);
    }

    const stepX = chartWidth / visibleCandles.length;
    const candleWidth = Math.max(3, Math.min(11, stepX * 0.65));

    // Vertical time ticks
    const timeTickStep = Math.max(1, Math.floor(visibleCandles.length / 6));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    visibleCandles.forEach((c, idx) => {
      const x = padLeft + idx * stepX + stepX / 2;
      if (idx % timeTickStep === 0) {
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, padTop);
        ctx.lineTo(Math.round(x) + 0.5, size.height - padBottom);
        ctx.stroke();

        const dt = new Date(c.time);
        const label =
          timeframe === '1D'
            ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : dt.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        ctx.fillStyle = textColor;
        ctx.fillText(label, x, size.height - padBottom + 7);
      }
    });

    // Bollinger Bands area & lines
    if (boll) {
      ctx.save();
      ctx.beginPath();
      let started = false;
      visibleCandles.forEach((_, idx) => {
        const u = boll.upper[idx];
        if (u === null) return;
        const x = padLeft + idx * stepX + stepX / 2;
        const y = yForPrice(u);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      for (let idx = visibleCandles.length - 1; idx >= 0; idx--) {
        const l = boll.lower[idx];
        if (l === null) continue;
        const x = padLeft + idx * stepX + stepX / 2;
        const y = yForPrice(l);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(37, 99, 235, 0.07)';
      ctx.fill();

      const drawLine = (arr: (number | null)[], stroke: string) => {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let init = false;
        arr.forEach((v, idx) => {
          if (v === null) return;
          const x = padLeft + idx * stepX + stepX / 2;
          const y = yForPrice(v);
          if (!init) {
            ctx.moveTo(x, y);
            init = true;
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      };
      drawLine(boll.upper, 'rgba(59, 130, 246, 0.55)');
      drawLine(boll.lower, 'rgba(59, 130, 246, 0.55)');
      ctx.restore();
    }

    // Volume histogram + Candlesticks
    const volBaseY = size.height - padBottom;
    visibleCandles.forEach((c, idx) => {
      const xCenter = padLeft + idx * stepX + stepX / 2;
      const isBull = c.close >= c.open;
      const color = isBull ? bullColor : bearColor;

      // Volume bar
      const vHeight = maxVol > 0 ? (c.volume / maxVol) * volHeight : 2;
      ctx.fillStyle = isBull ? 'rgba(22, 163, 74, 0.28)' : 'rgba(220, 38, 38, 0.28)';
      ctx.fillRect(xCenter - candleWidth / 2, volBaseY - vHeight, candleWidth, vHeight);

      // Wick
      const highY = yForPrice(c.high);
      const lowY = yForPrice(c.low);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(Math.round(xCenter) + 0.5, highY);
      ctx.lineTo(Math.round(xCenter) + 0.5, lowY);
      ctx.stroke();

      // Body
      const openY = yForPrice(c.open);
      const closeY = yForPrice(c.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
      ctx.fillStyle = color;
      ctx.fillRect(xCenter - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // Moving average overlays
    const drawOverlay = (series: (number | null)[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      series.forEach((v, idx) => {
        if (v === null) return;
        const x = padLeft + idx * stepX + stepX / 2;
        const y = yForPrice(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };

    if (showSma20) drawOverlay(sma20, '#F59E0B');
    if (showEma9) drawOverlay(ema9, '#3B82F6');

    // Current live price line + right-axis tag
    const liveY = Math.round(yForPrice(currentPrice)) + 0.5;
    const isUp = visibleCandles.length > 0 && currentPrice >= visibleCandles[0].open;
    const priceTagColor = isUp ? '#16A34A' : '#DC2626';

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = priceTagColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, liveY);
    ctx.lineTo(padLeft + chartWidth, liveY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = priceTagColor;
    ctx.fillRect(padLeft + chartWidth + 2, liveY - 10, padRight - 6, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentPrice.toFixed(decimals), padLeft + chartWidth + 7, liveY);

    // Crosshair on hover
    if (hoverIndex !== null && visibleCandles[hoverIndex]) {
      const x = Math.round(padLeft + hoverIndex * stepX + stepX / 2) + 0.5;
      const y = Math.round(yForPrice(visibleCandles[hoverIndex].close)) + 0.5;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.35)' : 'rgba(15, 23, 42, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, size.height - padBottom);
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartWidth, y);
      ctx.stroke();
      ctx.restore();
    }
  }, [visibleCandles, currentPrice, decimals, size, isDark, showSma20, showEma9, showBollinger, hoverIndex, timeframe]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 12;
    const chartWidth = size.width - 12 - 76;
    if (x < 0 || x > chartWidth || visibleCandles.length === 0) {
      setHoverIndex(null);
      return;
    }
    const idx = Math.min(
      visibleCandles.length - 1,
      Math.max(0, Math.floor((x / chartWidth) * visibleCandles.length))
    );
    setHoverIndex(idx);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      {/* Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-md">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onTimeframeChange(tf)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                timeframe === tf
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Technical Indicators */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleIndicator('ema9')}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showEma9
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            EMA 9
          </button>
          <button
            type="button"
            onClick={() => onToggleIndicator('sma20')}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showSma20
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            SMA 20
          </button>
          <button
            type="button"
            onClick={() => onToggleIndicator('bollinger')}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showBollinger
                ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Bollinger
          </button>
        </div>
      </div>

      {/* OHLCV Readout Line */}
      {inspectedCandle && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-1.5 text-xs font-mono border-b border-slate-100 dark:border-slate-800/70 text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-900 dark:text-slate-200">{symbol}</span>
          <span>O {inspectedCandle.open.toFixed(decimals)}</span>
          <span>H {inspectedCandle.high.toFixed(decimals)}</span>
          <span>L {inspectedCandle.low.toFixed(decimals)}</span>
          <span
            className={
              inspectedCandle.close >= inspectedCandle.open
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }
          >
            C {inspectedCandle.close.toFixed(decimals)}
          </span>
          <span>Vol {inspectedCandle.volume.toLocaleString()}</span>
        </div>
      )}

      {/* Canvas Viewport */}
      <div ref={containerRef} className="relative flex-1 min-h-[360px] w-full">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          className="block w-full h-full cursor-crosshair"
        />
      </div>
    </div>
  );
};
