import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { hashPin } from '../lib/crypto';

interface PinVerificationModalProps {
  isOpen: boolean;
  uid: string;
  expectedPinHash: string;
  title: string;
  subtitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const PinVerificationModal: React.FC<PinVerificationModalProps> = ({
  isOpen,
  uid,
  expectedPinHash,
  title,
  subtitle,
  onConfirm,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Enter your 4 to 6 digit Security PIN.');
      return;
    }
    setChecking(true);
    try {
      const candidateHash = await hashPin(pin, uid);
      if (candidateHash !== expectedPinHash) {
        setError('Incorrect Security PIN. Please try again.');
        setPin('');
        return;
      }
      setPin('');
      onConfirm();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-900">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 id="pin-modal-title" className="font-display text-base font-semibold text-slate-900">
                {title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPin('');
              setError(null);
              onCancel();
            }}
            aria-label="Close PIN verification"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="security-pin-verify" className="block text-xs font-medium text-slate-700 mb-1.5">
              Security PIN
            </label>
            <input
              id="security-pin-verify"
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full px-4 py-3 text-center text-lg font-mono tracking-[0.4em] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setPin('');
                setError(null);
                onCancel();
              }}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={checking || pin.length < 4}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              {checking ? 'Verifying...' : 'Authorize'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
