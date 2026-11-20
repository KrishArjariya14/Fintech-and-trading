import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Download, Landmark } from 'lucide-react';
import type {
  CurrencyCode,
  MarketInstrument,
  UserAccountState,
  WalletTransaction,
} from '../types/trading';

interface PortfolioWalletViewProps {
  userAccount: UserAccountState;
  instruments: MarketInstrument[];
  fxRates: Record<CurrencyCode, number>;
  transactions: WalletTransaction[];
  onRequireMfa: (onVerified: () => void) => void;
}

const PAYMENT_RAILS = [
  'Plaid Instant ACH',
  'Stripe Card Settlement',
  'SEPA Wire Transfer',
  'Fedwire Institutional',
];

export const PortfolioWalletView: React.FC<PortfolioWalletViewProps> = ({
  userAccount,
  instruments,
  fxRates,
  transactions,
  onRequireMfa,
}) => {
  const [transferAction, setTransferAction] = useState<'deposit' | 'withdrawal'>('deposit');
  const [transferCurrency, setTransferCurrency] = useState<CurrencyCode>('USD');
  const [transferAmount, setTransferAmount] = useState('5000');
  const [transferRail, setTransferRail] = useState(PAYMENT_RAILS[0]);
  const [transferStatus, setTransferStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [transferring, setTransferring] = useState(false);

  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>('USD');
  const [toCurrency, setToCurrency] = useState<CurrencyCode>('EUR');
  const [fxAmount, setFxAmount] = useState('1000');
  const [fxStatus, setFxStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [converting, setConverting] = useState(false);

  const [txFilter, setTxFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'fx_conversion' | 'trade_settlement'>('all');

  const instrumentMap = useMemo(() => {
    const m = new Map<string, MarketInstrument>();
    for (const i of instruments) m.set(i.symbol, i);
    return m;
  }, [instruments]);

  const holdingsValueUsd = useMemo(() => {
    return userAccount.holdings.reduce((sum, h) => {
      const price = instrumentMap.get(h.symbol)?.price ?? h.avgEntryPrice;
      return sum + price * h.quantity;
    }, 0);
  }, [userAccount.holdings, instrumentMap]);

  const totalCashUsd =
    userAccount.cashBalances.USD +
    userAccount.cashBalances.EUR * fxRates.EUR +
    userAccount.cashBalances.GBP * fxRates.GBP;

  const totalNetWorthUsd = totalCashUsd + holdingsValueUsd;

  const userTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.userId !== userAccount.profile.id) return false;
      if (txFilter !== 'all' && t.type !== txFilter) return false;
      return true;
    });
  }, [transactions, userAccount.profile.id, txFilter]);

  const executeTransfer = async () => {
    setTransferring(true);
    setTransferStatus(null);
    try {
      const res = await fetch('/api/wallet/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userAccount.profile.id,
          action: transferAction,
          currency: transferCurrency,
          amount: Number(transferAmount),
          rail: transferRail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTransferStatus({ type: 'err', text: data.error || 'Transfer rejected.' });
        return;
      }
      setTransferStatus({
        type: 'ok',
        text: `${transferAction === 'deposit' ? 'Deposit' : 'Withdrawal'} settled (${data.transaction.referenceId}).`,
      });
    } catch {
      setTransferStatus({ type: 'err', text: 'Gateway connection failure.' });
    } finally {
      setTransferring(false);
    }
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userAccount.profile.role === 'compliance') {
      setTransferStatus({ type: 'err', text: 'Compliance accounts do not hold trading funds.' });
      return;
    }
    if (transferAction === 'withdrawal') {
      onRequireMfa(() => {
        void executeTransfer();
      });
    } else {
      void executeTransfer();
    }
  };

  const handleFxConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setFxStatus(null);
    if (userAccount.profile.role === 'compliance') {
      setFxStatus({ type: 'err', text: 'Compliance accounts cannot execute FX conversions.' });
      return;
    }
    setConverting(true);
    try {
      const res = await fetch('/api/wallet/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userAccount.profile.id,
          fromCurrency,
          toCurrency,
          amount: Number(fxAmount),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFxStatus({ type: 'err', text: data.error || 'FX conversion rejected.' });
        return;
      }
      setFxStatus({
        type: 'ok',
        text: `Converted to ${data.convertedAmount.toLocaleString()} ${toCurrency}.`,
      });
    } catch {
      setFxStatus({ type: 'err', text: 'FX desk request failed.' });
    } finally {
      setConverting(false);
    }
  };

  const exportTransactionsCsv = () => {
    const header = 'ID,Type,Rail,Currency,Amount,USD Equivalent,Status,Reference,Timestamp\n';
    const rows = userTransactions
      .map(
        (t) =>
          `${t.id},${t.type},"${t.rail}",${t.currency},${t.amount},${t.usdEquivalent},${t.status},${t.referenceId},${new Date(t.timestamp).toISOString()}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meridian-wallet-ledger-${userAccount.profile.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewConverted =
    ((Number(fxAmount) || 0) * fxRates[fromCurrency] / fxRates[toCurrency]) * 0.9985;

  return (
    <div className="flex flex-col gap-5">
      {/* Portfolio Valuation Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Account Equity</div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1">
            ${totalNetWorthUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Multi-currency cash · Live mark-to-market
          </div>
        </div>

        <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">USD Settlement Cash</div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1">
            ${userAccount.cashBalances.USD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
            Reserved: ${userAccount.reservedCashUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">EUR &amp; GBP Liquidity</div>
          <div className="text-lg font-mono font-semibold text-slate-900 dark:text-white mt-1">
            €{userAccount.cashBalances.EUR.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-sm font-mono text-slate-600 dark:text-slate-300 mt-0.5">
            £{userAccount.cashBalances.GBP.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Asset Holdings</div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1">
            ${holdingsValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {userAccount.holdings.length} active positions
          </div>
        </div>
      </div>

      {/* Payment Gateway & FX Conversion Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Banking & Payment Gateway Integration */}
        <form
          onSubmit={handleTransferSubmit}
          className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Payment Gateway Settlement
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Plaid ACH, Stripe Card, and Wire transfers with MFA withdrawal protection.
              </p>
            </div>
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-md">
              <button
                type="button"
                onClick={() => {
                  setTransferAction('deposit');
                  setTransferStatus(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  transferAction === 'deposit'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={() => {
                  setTransferAction('withdrawal');
                  setTransferStatus(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  transferAction === 'withdrawal'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Withdraw
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Currency
              </label>
              <select
                value={transferCurrency}
                onChange={(e) => setTransferCurrency(e.target.value as CurrencyCode)}
                className="px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Settlement Rail
              </label>
              <select
                value={transferRail}
                onChange={(e) => setTransferRail(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                {PAYMENT_RAILS.map((rail) => (
                  <option key={rail} value={rail}>
                    {rail}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Amount ({transferCurrency})
            </label>
            <input
              type="number"
              min="1"
              step="any"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              className="px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
            />
          </div>

          {transferStatus && (
            <div
              className={`text-xs px-3 py-2 rounded-md border ${
                transferStatus.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {transferStatus.text}
            </div>
          )}

          <button
            type="submit"
            disabled={transferring}
            className="mt-auto py-2.5 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            {transferring
              ? 'Settling...'
              : transferAction === 'deposit'
                ? `Deposit ${transferCurrency} via ${transferRail.split(' ')[0]}`
                : `Authorize ${transferCurrency} Withdrawal (MFA)`}
          </button>
        </form>

        {/* Cross-Border Multi-Currency FX Desk */}
        <form
          onSubmit={handleFxConvert}
          className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col gap-4"
        >
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Multi-Currency FX Desk
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live cross-border currency conversion against real-time institutional feeds.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                From Wallet
              </label>
              <select
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value as CurrencyCode)}
                className="px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                <option value="USD">USD ({userAccount.cashBalances.USD.toLocaleString()})</option>
                <option value="EUR">EUR ({userAccount.cashBalances.EUR.toLocaleString()})</option>
                <option value="GBP">GBP ({userAccount.cashBalances.GBP.toLocaleString()})</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                To Wallet
              </label>
              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value as CurrencyCode)}
                className="px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Convert Amount ({fromCurrency})
            </label>
            <input
              type="number"
              min="1"
              step="any"
              value={fxAmount}
              onChange={(e) => setFxAmount(e.target.value)}
              className="px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-between text-xs py-2 px-3 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-md">
            <span className="text-slate-500 dark:text-slate-400">Estimated Settlement</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-white">
              {previewConverted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {toCurrency}
            </span>
          </div>

          {fxStatus && (
            <div
              className={`text-xs px-3 py-2 rounded-md border ${
                fxStatus.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {fxStatus.text}
            </div>
          )}

          <button
            type="submit"
            disabled={converting || fromCurrency === toCurrency}
            className="mt-auto py-2.5 px-4 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            {converting ? 'Converting...' : `Convert ${fromCurrency} to ${toCurrency}`}
          </button>
        </form>
      </div>

      {/* Wallet Ledger & Settlement History */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-md">
            {(
              [
                { id: 'all', label: 'All Entries' },
                { id: 'deposit', label: 'Deposits' },
                { id: 'withdrawal', label: 'Withdrawals' },
                { id: 'fx_conversion', label: 'FX' },
                { id: 'trade_settlement', label: 'Trade Settlements' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTxFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  txFilter === f.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportTransactionsCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Reference</th>
                <th className="py-2.5 px-4 font-medium">Type</th>
                <th className="py-2.5 px-4 font-medium">Settlement Rail</th>
                <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                <th className="py-2.5 px-4 font-medium text-right">USD Value</th>
                <th className="py-2.5 px-4 font-medium text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {userTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    No ledger entries match this filter.
                  </td>
                </tr>
              ) : (
                userTransactions.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                  >
                    <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                      {t.referenceId}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white capitalize">
                      {t.type.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                      {t.rail}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono font-medium ${
                        t.amount >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {t.amount >= 0 ? '+' : ''}
                      {t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {t.currency}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                      ${t.usdEquivalent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                      {new Date(t.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
