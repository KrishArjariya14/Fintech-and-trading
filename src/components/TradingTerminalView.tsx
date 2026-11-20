import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type {
  ExecutionReceipt,
  MarketInstrument,
  MarketTrade,
  Order,
  Timeframe,
  UserAccountState,
} from '../types/trading';
import { CandlestickChart } from './CandlestickChart';
import { OrderBookPanel } from './OrderBookPanel';
import { OrderTicket } from './OrderTicket';

interface TradingTerminalViewProps {
  instruments: MarketInstrument[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  recentTrades: Record<string, MarketTrade[]>;
  userAccount: UserAccountState;
  orders: Order[];
  receipts: ExecutionReceipt[];
  circuitBreakerActive: boolean;
  isDark: boolean;
  onOrderCancelled: (orderId: string) => void;
  onSelectReceipt: (receipt: ExecutionReceipt) => void;
}

export const TradingTerminalView: React.FC<TradingTerminalViewProps> = ({
  instruments,
  selectedSymbol,
  onSelectSymbol,
  recentTrades,
  userAccount,
  orders,
  receipts,
  circuitBreakerActive,
  isDark,
  onOrderCancelled,
  onSelectReceipt,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [showSma20, setShowSma20] = useState(true);
  const [showEma9, setShowEma9] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [selectedPriceFromBook, setSelectedPriceFromBook] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState<'all' | 'crypto' | 'equity' | 'fx'>('all');
  const [bottomTab, setBottomTab] = useState<'positions' | 'open_orders' | 'receipts'>('positions');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const activeInstrument =
    instruments.find((i) => i.symbol === selectedSymbol) ?? instruments[0];

  const filteredInstruments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return instruments.filter((inst) => {
      if (assetFilter !== 'all' && inst.assetClass !== assetFilter) return false;
      if (!q) return true;
      return (
        inst.symbol.toLowerCase().includes(q) ||
        inst.name.toLowerCase().includes(q)
      );
    });
  }, [instruments, searchQuery, assetFilter]);

  const userOpenOrders = useMemo(
    () => orders.filter((o) => o.userId === userAccount.profile.id && o.status === 'open'),
    [orders, userAccount.profile.id]
  );

  const userReceipts = useMemo(
    () => receipts.filter((r) => r.userId === userAccount.profile.id),
    [receipts, userAccount.profile.id]
  );

  const instrumentMap = useMemo(() => {
    const m = new Map<string, MarketInstrument>();
    for (const inst of instruments) m.set(inst.symbol, inst);
    return m;
  }, [instruments]);

  const handleToggleIndicator = (ind: 'sma20' | 'ema9' | 'bollinger') => {
    if (ind === 'sma20') setShowSma20((v) => !v);
    if (ind === 'ema9') setShowEma9((v) => !v);
    if (ind === 'bollinger') setShowBollinger((v) => !v);
  };

  const handleCancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}?actorId=${encodeURIComponent(userAccount.profile.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onOrderCancelled(orderId);
      }
    } finally {
      setCancellingId(null);
    }
  };

  if (!activeInstrument) return null;

  const isPositive = activeInstrument.changePct >= 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Market Watchlist Strip + Filter */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-md">
            {(['all', 'crypto', 'equity', 'fx'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setAssetFilter(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  assetFilter === cat
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {cat === 'all' ? 'All Markets' : cat === 'crypto' ? 'Crypto' : cat === 'equity' ? 'Equities' : 'FX & Gold'}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter ticker or name..."
              aria-label="Filter market instruments"
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {filteredInstruments.map((inst) => {
            const active = inst.symbol === activeInstrument.symbol;
            const up = inst.changePct >= 0;
            return (
              <button
                key={inst.symbol}
                type="button"
                onClick={() => onSelectSymbol(inst.symbol)}
                className={`flex items-center gap-3 px-3 py-1.5 rounded-md border text-left transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-blue-500 bg-blue-500/8 dark:bg-blue-500/12'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/70'
                }`}
              >
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {inst.symbol}
                </span>
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                  {inst.price.toFixed(inst.decimals)}
                </span>
                <span
                  className={`text-[11px] font-mono font-medium ${
                    up
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {up ? '+' : ''}
                  {inst.changePct.toFixed(2)}%
                </span>
              </button>
            );
          })}
          {filteredInstruments.length === 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400 py-1">
              No matching instruments found.
            </span>
          )}
        </div>
      </div>

      {/* Selected Instrument Telemetry Header */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
            {activeInstrument.symbol}
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {activeInstrument.name}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Last Price</div>
            <div className="text-base font-mono font-semibold text-slate-900 dark:text-white">
              ${activeInstrument.price.toFixed(activeInstrument.decimals)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">24h Change</div>
            <div
              className={`font-mono font-semibold ${
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPositive ? '+' : ''}
              {activeInstrument.changePct.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">24h High</div>
            <div className="font-mono text-slate-900 dark:text-slate-200">
              ${activeInstrument.high24h.toFixed(activeInstrument.decimals)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">24h Low</div>
            <div className="font-mono text-slate-900 dark:text-slate-200">
              ${activeInstrument.low24h.toFixed(activeInstrument.decimals)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">24h Volume</div>
            <div className="font-mono text-slate-900 dark:text-slate-200">
              {activeInstrument.volume24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      {/* Main 12-Column Trading Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-6 xl:col-span-7 min-h-[440px]">
          <CandlestickChart
            symbol={activeInstrument.symbol}
            candles={activeInstrument.candles[timeframe]}
            currentPrice={activeInstrument.price}
            decimals={activeInstrument.decimals}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            isDark={isDark}
            showSma20={showSma20}
            showEma9={showEma9}
            showBollinger={showBollinger}
            onToggleIndicator={handleToggleIndicator}
          />
        </div>

        <div className="lg:col-span-3 xl:col-span-2 min-h-[440px]">
          <OrderBookPanel
            instrument={activeInstrument}
            recentTrades={recentTrades[activeInstrument.symbol] ?? []}
            onSelectPrice={(p) => setSelectedPriceFromBook(p)}
          />
        </div>

        <div className="lg:col-span-3 xl:col-span-3 min-h-[440px]">
          <OrderTicket
            instrument={activeInstrument}
            userAccount={userAccount}
            circuitBreakerActive={circuitBreakerActive}
            selectedPriceFromBook={selectedPriceFromBook}
            onOrderSuccess={(receipt) => {
              if (receipt) onSelectReceipt(receipt);
            }}
          />
        </div>
      </div>

      {/* Bottom Portfolio Positions, Open Orders & Execution Receipts */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-md">
            <button
              type="button"
              onClick={() => setBottomTab('positions')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                bottomTab === 'positions'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Active Positions ({userAccount.holdings.length})
            </button>
            <button
              type="button"
              onClick={() => setBottomTab('open_orders')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                bottomTab === 'open_orders'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Open Orders ({userOpenOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setBottomTab('receipts')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                bottomTab === 'receipts'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Execution Receipts ({userReceipts.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {bottomTab === 'positions' && (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-medium">Instrument</th>
                  <th className="py-2.5 px-4 font-medium text-right">Quantity</th>
                  <th className="py-2.5 px-4 font-medium text-right">Avg Entry</th>
                  <th className="py-2.5 px-4 font-medium text-right">Mark Price</th>
                  <th className="py-2.5 px-4 font-medium text-right">Market Value</th>
                  <th className="py-2.5 px-4 font-medium text-right">Unrealized P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {userAccount.holdings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      No open asset positions for this account. Submit a market or limit buy order to open a position.
                    </td>
                  </tr>
                ) : (
                  userAccount.holdings.map((h) => {
                    const inst = instrumentMap.get(h.symbol);
                    const mark = inst?.price ?? h.avgEntryPrice;
                    const value = mark * h.quantity;
                    const pnl = (mark - h.avgEntryPrice) * h.quantity;
                    const pnlPct = h.avgEntryPrice > 0 ? ((mark - h.avgEntryPrice) / h.avgEntryPrice) * 100 : 0;
                    const pos = pnl >= 0;
                    return (
                      <tr
                        key={h.symbol}
                        onClick={() => onSelectSymbol(h.symbol)}
                        className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                      >
                        <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                          {h.symbol}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                          {h.quantity.toFixed(4)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                          ${h.avgEntryPrice.toFixed(inst?.decimals ?? 2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-900 dark:text-white">
                          ${mark.toFixed(inst?.decimals ?? 2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-900 dark:text-white">
                          ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono font-medium ${
                            pos
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {pos ? '+' : '-'}${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({pos ? '+' : ''}
                          {pnlPct.toFixed(2)}%)
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {bottomTab === 'open_orders' && (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-medium">Order ID</th>
                  <th className="py-2.5 px-4 font-medium">Symbol</th>
                  <th className="py-2.5 px-4 font-medium">Side / Type</th>
                  <th className="py-2.5 px-4 font-medium text-right">Qty</th>
                  <th className="py-2.5 px-4 font-medium text-right">Trigger Price</th>
                  <th className="py-2.5 px-4 font-medium text-right">Reserved Notional</th>
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {userOpenOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      No active resting limit or stop-loss orders in the matching book.
                    </td>
                  </tr>
                ) : (
                  userOpenOrders.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                    >
                      <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {o.id}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {o.symbol}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`font-medium ${
                            o.side === 'buy'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {o.side === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {o.type === 'limit' ? 'Limit' : o.type === 'stop_loss' ? 'Stop-Loss' : 'Market'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        {o.quantity}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-900 dark:text-white">
                        ${(o.limitPrice ?? o.stopPrice ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        ${o.notionalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          disabled={cancellingId === o.id}
                          onClick={() => handleCancelOrder(o.id)}
                          className="px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {cancellingId === o.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {bottomTab === 'receipts' && (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 font-medium">Receipt ID</th>
                  <th className="py-2.5 px-4 font-medium">Instrument</th>
                  <th className="py-2.5 px-4 font-medium">Side</th>
                  <th className="py-2.5 px-4 font-medium text-right">Fill Price</th>
                  <th className="py-2.5 px-4 font-medium text-right">Net Settlement</th>
                  <th className="py-2.5 px-4 font-medium text-right">Latency</th>
                  <th className="py-2.5 px-4 font-medium text-right">Signature Hash</th>
                </tr>
              </thead>
              <tbody>
                {userReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                      No execution receipts recorded yet for this account.
                    </td>
                  </tr>
                ) : (
                  userReceipts.map((r) => (
                    <tr
                      key={r.receiptId}
                      onClick={() => onSelectReceipt(r)}
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono font-medium text-blue-600 dark:text-blue-400">
                        {r.receiptId}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {r.symbol}
                      </td>
                      <td
                        className={`py-2.5 px-4 font-medium ${
                          r.side === 'buy'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {r.side === 'buy' ? 'Buy' : 'Sell'} ({r.quantity})
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-900 dark:text-white">
                        ${r.fillPrice.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-900 dark:text-white">
                        ${r.netSettlementUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                        {r.settlementLatencyMs}ms
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                        {r.signatureHash.slice(0, 12)}...
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
