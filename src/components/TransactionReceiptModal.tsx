import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { TransactionDoc } from '../types/wallet';
import { formatCDC } from '../lib/crypto';

interface TransactionReceiptModalProps {
  tx: TransactionDoc | null;
  currentUid: string;
  onClose: () => void;
}

export const TransactionReceiptModal: React.FC<TransactionReceiptModalProps> = ({
  tx,
  currentUid,
  onClose,
}) => {
  const [copiedId, setCopiedId] = useState(false);

  if (!tx) return null;

  const isOutgoing = tx.fromUid === currentUid;
  const dateLabel = tx.createdAt
    ? tx.createdAt.toDate().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Pending timestamp';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(tx.txId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">
              {tx.type === 'faucet_grant'
                ? 'Treasury Faucet Grant'
                : isOutgoing
                ? 'Outgoing P2P Transfer'
                : 'Incoming P2P Transfer'}
            </div>
            <h3 id="receipt-title" className="font-display text-2xl font-bold tabular-nums text-slate-900 mt-1">
              {isOutgoing ? '-' : '+'}
              {formatCDC(tx.amountCents)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-slate-200 border-y border-slate-200 text-sm">
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">Status</span>
            <span className="font-medium text-emerald-700">Completed</span>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">Timestamp</span>
            <span className="font-mono tabular-nums text-xs text-slate-900">{dateLabel}</span>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">From</span>
            <div className="text-right">
              <div className="font-medium text-slate-900">{tx.fromName}</div>
              <div className="font-mono text-xs text-slate-500">{tx.fromAddress}</div>
            </div>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">To</span>
            <div className="text-right">
              <div className="font-medium text-slate-900">{tx.toName}</div>
              <div className="font-mono text-xs text-slate-500">{tx.toAddress}</div>
            </div>
          </div>
          {tx.note && (
            <div className="py-3 flex items-start justify-between gap-4">
              <span className="text-slate-500 shrink-0">Note</span>
              <span className="text-slate-900 text-right">{tx.note}</span>
            </div>
          )}
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-slate-500">Transaction ID</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-700 hover:text-slate-900"
            >
              <span className="truncate max-w-[180px]">{tx.txId}</span>
              {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Close Receipt
        </button>
      </div>
    </div>
  );
};
