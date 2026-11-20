import React from 'react';
import { Download, Receipt, X } from 'lucide-react';
import type { ExecutionReceipt } from '../types/trading';

interface ReceiptModalProps {
  receipt: ExecutionReceipt | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const downloadReceiptJson = () => {
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${receipt.receiptId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
        className="w-full max-w-md bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h3
            id="receipt-modal-title"
            className="text-sm font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2"
          >
            <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Execution Receipt · {receipt.receiptId}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt modal"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs">
          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
            <span className="text-slate-500 dark:text-slate-400">Order Reference</span>
            <span className="font-mono text-slate-900 dark:text-white">{receipt.orderId}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
            <span className="text-slate-500 dark:text-slate-400">Instrument &amp; Side</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {receipt.side.toUpperCase()} {receipt.quantity} {receipt.symbol}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
            <span className="text-slate-500 dark:text-slate-400">Fill Price</span>
            <span className="font-mono text-slate-900 dark:text-white">
              ${receipt.fillPrice.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
            <span className="text-slate-500 dark:text-slate-400">Gross Notional</span>
            <span className="font-mono text-slate-900 dark:text-white">
              ${receipt.grossNotionalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
            <span className="text-slate-500 dark:text-slate-400">Clearing Fee</span>
            <span className="font-mono text-slate-900 dark:text-white">
              ${receipt.feeUsd.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70 font-semibold">
            <span className="text-slate-700 dark:text-slate-300">Net Settlement</span>
            <span className="font-mono text-slate-900 dark:text-white">
              ${receipt.netSettlementUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
            <span className="text-slate-500 dark:text-slate-400">Matching Latency</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              {receipt.settlementLatencyMs}ms
            </span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-500 dark:text-slate-400">Signature Hash</span>
            <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
              {receipt.signatureHash}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={downloadReceiptJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-md text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download JSON
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
