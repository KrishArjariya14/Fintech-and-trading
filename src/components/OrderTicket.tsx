import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Receipt, ShieldAlert } from 'lucide-react';
import type {
  ExecutionReceipt,
  MarketInstrument,
  OrderSide,
  OrderType,
  UserAccountState,
} from '../types/trading';

interface OrderTicketProps {
  instrument: MarketInstrument;
  userAccount: UserAccountState;
  circuitBreakerActive: boolean;
  selectedPriceFromBook: number | null;
  onOrderSuccess: (receipt?: ExecutionReceipt, note?: string) => void;
}

export const OrderTicket: React.FC<OrderTicketProps> = ({
  instrument,
  userAccount,
  circuitBreakerActive,
  selectedPriceFromBook,
  onOrderSuccess,
}) => {
  const [side, setSide] = useState<OrderSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantityStr, setQuantityStr] = useState<string>('0.25');
  const [limitPriceStr, setLimitPriceStr] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ExecutionReceipt | null>(null);
  const [restingNotice, setRestingNotice] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPriceFromBook !== null) {
      setLimitPriceStr(selectedPriceFromBook.toFixed(instrument.decimals));
      if (orderType === 'market') {
        setOrderType('limit');
      }
    }
  }, [selectedPriceFromBook, instrument.decimals]);

  useEffect(() => {
    setLimitPriceStr(instrument.price.toFixed(instrument.decimals));
    if (instrument.price > 10000) setQuantityStr('0.15');
    else if (instrument.price > 500) setQuantityStr('1.5');
    else setQuantityStr('10');
    setErrorMsg(null);
    setRestingNotice(null);
  }, [instrument.symbol]);

  const availableUsd = Math.max(0, userAccount.cashBalances.USD - userAccount.reservedCashUsd);
  const holdingQty =
    userAccount.holdings.find((h) => h.symbol === instrument.symbol)?.quantity ?? 0;

  const parsedQty = Number(quantityStr) || 0;
  const parsedCustomPrice = Number(limitPriceStr) || instrument.price;
  const effectivePrice =
    orderType === 'market'
      ? side === 'buy'
        ? instrument.ask
        : instrument.bid
      : parsedCustomPrice;

  const estimatedNotional = parsedQty * effectivePrice;
  const feeRate = userAccount.profile.role === 'institutional' ? 0.0004 : 0.001;
  const estimatedFee = estimatedNotional * feeRate;
  const estimatedTotal =
    side === 'buy' ? estimatedNotional + estimatedFee : Math.max(0, estimatedNotional - estimatedFee);

  const isComplianceReadOnly = userAccount.profile.role === 'compliance';
  const insufficientFunds =
    side === 'buy' ? estimatedTotal > availableUsd : parsedQty > holdingQty;

  const applyAllocationPct = (pct: number) => {
    if (side === 'buy') {
      const budget = (availableUsd * pct) / (1 + feeRate);
      const qty = effectivePrice > 0 ? budget / effectivePrice : 0;
      setQuantityStr(qty > 10 ? qty.toFixed(2) : qty.toFixed(4));
    } else {
      const qty = holdingQty * pct;
      setQuantityStr(qty > 10 ? qty.toFixed(2) : qty.toFixed(4));
    }
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setRestingNotice(null);
    setLastReceipt(null);

    if (isComplianceReadOnly) {
      setErrorMsg('Switch to Retail or Institutional Trader role to submit live orders.');
      return;
    }

    if (parsedQty <= 0) {
      setErrorMsg('Enter a valid quantity greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        userId: userAccount.profile.id,
        symbol: instrument.symbol,
        side,
        type: orderType,
        quantity: parsedQty,
      };
      if (orderType === 'limit') payload.limitPrice = parsedCustomPrice;
      if (orderType === 'stop_loss') payload.stopPrice = parsedCustomPrice;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Order rejected by risk engine.');
        return;
      }

      if (data.receipt) {
        setLastReceipt(data.receipt);
        onOrderSuccess(data.receipt);
      } else if (data.order) {
        setRestingNotice(`Order ${data.order.id} queued in active matching book.`);
        onOrderSuccess(undefined, `Queued ${data.order.id}`);
      }
    } catch {
      setErrorMsg('Network error communicating with execution engine.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-4 gap-3.5">
      {/* Buy / Sell Segmented Toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-md">
        <button
          type="button"
          onClick={() => {
            setSide('buy');
            setErrorMsg(null);
          }}
          className={`py-2 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            side === 'buy'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Buy {instrument.symbol.split('-')[0]}
        </button>
        <button
          type="button"
          onClick={() => {
            setSide('sell');
            setErrorMsg(null);
          }}
          className={`py-2 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            side === 'sell'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Sell {instrument.symbol.split('-')[0]}
        </button>
      </div>

      {/* Order Type Selector */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-2.5">
        {(['market', 'limit', 'stop_loss'] as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setOrderType(t)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              orderType === t
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t === 'market' ? 'Market' : t === 'limit' ? 'Limit' : 'Stop-Loss'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1">
        {/* Available Balance Row (REQ-3) */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            {side === 'buy' ? 'Available USD' : `Available ${instrument.symbol}`}
          </span>
          <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
            {side === 'buy'
              ? `$${availableUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `${holdingQty.toFixed(4)}`}
          </span>
        </div>

        {/* Limit / Stop Price Input */}
        {orderType !== 'market' && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="order-price-input"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              {orderType === 'limit' ? 'Limit Price (USD)' : 'Stop Trigger Price (USD)'}
            </label>
            <input
              id="order-price-input"
              type="number"
              step="any"
              min="0"
              value={limitPriceStr}
              onChange={(e) => setLimitPriceStr(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        )}

        {/* Quantity Input */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="order-qty-input"
            className="text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            Quantity ({instrument.symbol.split('-')[0]})
          </label>
          <input
            id="order-qty-input"
            type="number"
            step="any"
            min="0"
            value={quantityStr}
            onChange={(e) => {
              setQuantityStr(e.target.value);
              setErrorMsg(null);
            }}
            className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <div className="grid grid-cols-4 gap-1.5 mt-1">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyAllocationPct(pct)}
                className="py-1 text-[11px] font-mono bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded transition-colors cursor-pointer"
              >
                {pct * 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Order Summary Breakdown */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 mt-1 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>{orderType === 'market' ? 'Est. Execution Price' : 'Target Price'}</span>
            <span className="font-mono text-slate-900 dark:text-slate-200">
              ${effectivePrice.toFixed(instrument.decimals)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Fee ({userAccount.profile.role === 'institutional' ? '4 bps' : '10 bps'})</span>
            <span className="font-mono text-slate-900 dark:text-slate-200">
              ${estimatedFee.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between font-medium text-slate-900 dark:text-white pt-1">
            <span>{side === 'buy' ? 'Total Debit' : 'Net Proceeds'}</span>
            <span className="font-mono">
              ${estimatedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {circuitBreakerActive && (
          <div className="flex items-start gap-2 p-2.5 text-xs bg-amber-500/10 border border-amber-500/30 rounded-md text-amber-700 dark:text-amber-300">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Safety Circuit Breaker active. Order matching temporarily paused.</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2 p-2.5 text-xs bg-rose-500/10 border border-rose-500/30 rounded-md text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {restingNotice && (
          <div className="flex items-start gap-2 p-2.5 text-xs bg-blue-500/10 border border-blue-500/30 rounded-md text-blue-700 dark:text-blue-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{restingNotice}</span>
          </div>
        )}

        {lastReceipt && (
          <div className="p-2.5 text-xs bg-emerald-500/10 border border-emerald-500/30 rounded-md text-emerald-800 dark:text-emerald-300 space-y-1">
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                {lastReceipt.receiptId}
              </span>
              <span className="font-mono">{lastReceipt.settlementLatencyMs}ms</span>
            </div>
            <div className="font-mono text-[11px] opacity-90">
              Filled {lastReceipt.quantity} {lastReceipt.symbol} @ ${lastReceipt.fillPrice.toFixed(instrument.decimals)}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || circuitBreakerActive || isComplianceReadOnly || insufficientFunds}
          className={`mt-auto w-full py-2.5 px-4 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            side === 'buy'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-rose-600 hover:bg-rose-700 text-white'
          }`}
        >
          {submitting
            ? 'Routing Order...'
            : isComplianceReadOnly
              ? 'Read-Only Compliance Role'
              : insufficientFunds
                ? side === 'buy'
                  ? 'Insufficient USD Balance'
                  : 'Insufficient Holdings'
                : `${side === 'buy' ? 'Place Buy' : 'Place Sell'} ${orderType === 'market' ? 'Market' : orderType === 'limit' ? 'Limit' : 'Stop-Loss'} Order`}
        </button>
      </form>
    </div>
  );
};
