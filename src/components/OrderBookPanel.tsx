import React, { useState } from 'react';
import type { MarketInstrument, MarketTrade } from '../types/trading';

interface OrderBookPanelProps {
  instrument: MarketInstrument;
  recentTrades: MarketTrade[];
  onSelectPrice: (price: number) => void;
}

export const OrderBookPanel: React.FC<OrderBookPanelProps> = ({
  instrument,
  recentTrades,
  onSelectPrice,
}) => {
  const [tab, setTab] = useState<'book' | 'trades'>('book');
  const maxAskTotal = instrument.asks[instrument.asks.length - 1]?.total || 1;
  const maxBidTotal = instrument.bids[instrument.bids.length - 1]?.total || 1;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-md w-full">
          <button
            type="button"
            onClick={() => setTab('book')}
            className={`flex-1 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'book'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Order Book
          </button>
          <button
            type="button"
            onClick={() => setTab('trades')}
            className={`flex-1 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'trades'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Market Tape
          </button>
        </div>
      </div>

      {tab === 'book' ? (
        <div className="flex-1 flex flex-col text-xs font-mono">
          <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/70">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Depth</span>
          </div>

          {/* Asks (Reversed so best ask sits right above spread) */}
          <div className="flex-1 flex flex-col justify-end overflow-hidden">
            {[...instrument.asks]
              .slice(0, 8)
              .reverse()
              .map((lvl, idx) => {
                const depthPct = Math.min(100, (lvl.total / maxAskTotal) * 100);
                return (
                  <button
                    key={`ask-${idx}`}
                    type="button"
                    onClick={() => onSelectPrice(lvl.price)}
                    className="relative grid grid-cols-3 px-3 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    <div
                      className="absolute inset-y-0 right-0 bg-rose-500/10 dark:bg-rose-500/15 pointer-events-none"
                      style={{ width: `${depthPct}%` }}
                    />
                    <span className="relative text-rose-600 dark:text-rose-400">
                      {lvl.price.toFixed(instrument.decimals)}
                    </span>
                    <span className="relative text-right text-slate-700 dark:text-slate-300">
                      {lvl.size.toFixed(2)}
                    </span>
                    <span className="relative text-right text-slate-500 dark:text-slate-400">
                      {lvl.total.toFixed(2)}
                    </span>
                  </button>
                );
              })}
          </div>

          {/* Spread Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-900/70 border-y border-slate-200 dark:border-slate-800 text-[11px]">
            <span className="font-semibold text-slate-900 dark:text-white">
              {instrument.price.toFixed(instrument.decimals)}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Spread {instrument.spreadBps.toFixed(2)} bps
            </span>
          </div>

          {/* Bids */}
          <div className="flex-1 overflow-hidden">
            {instrument.bids.slice(0, 8).map((lvl, idx) => {
              const depthPct = Math.min(100, (lvl.total / maxBidTotal) * 100);
              return (
                <button
                  key={`bid-${idx}`}
                  type="button"
                  onClick={() => onSelectPrice(lvl.price)}
                  className="relative grid grid-cols-3 px-3 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-emerald-500/10 dark:bg-emerald-500/15 pointer-events-none"
                    style={{ width: `${depthPct}%` }}
                  />
                  <span className="relative text-emerald-600 dark:text-emerald-400">
                    {lvl.price.toFixed(instrument.decimals)}
                  </span>
                  <span className="relative text-right text-slate-700 dark:text-slate-300">
                    {lvl.size.toFixed(2)}
                  </span>
                  <span className="relative text-right text-slate-500 dark:text-slate-400">
                    {lvl.total.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col text-xs font-mono overflow-y-auto max-h-[420px]">
          <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/70">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Time</span>
          </div>
          {recentTrades.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectPrice(t.price)}
              className="grid grid-cols-3 px-3 py-1.5 text-left border-b border-slate-100/60 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
            >
              <span
                className={
                  t.side === 'buy'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }
              >
                {t.price.toFixed(instrument.decimals)}
              </span>
              <span className="text-right text-slate-700 dark:text-slate-300">
                {t.size.toFixed(3)}
              </span>
              <span className="text-right text-slate-500 dark:text-slate-400">
                {new Date(t.timestamp).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
