import React, { useEffect, useState } from 'react';
import { CheckCircle2, Fingerprint, KeyRound, Lock, X } from 'lucide-react';
import { hashPin } from '../lib/crypto';
import { verifyBiometricCredential } from '../lib/webauthn';
import { recordWalletSecurityEvent } from '../services/walletService';
import type { WalletDoc } from '../types/wallet';

interface AuthChallengeModalProps {
  isOpen: boolean;
  wallet: WalletDoc;
  title: string;
  subtitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AuthChallengeModal: React.FC<AuthChallengeModalProps> = ({
  isOpen,
  wallet,
  title,
  subtitle,
  onConfirm,
  onCancel,
}) => {
  const hasBiometric = Boolean(wallet.biometricEnabled && wallet.biometricCredentialId);
  const hasPin = Boolean(wallet.requirePinForSend && wallet.pinHash);
  const mode = wallet.biometricMode ?? 'either';
  const requiresBoth = hasBiometric && hasPin && mode === 'both';

  const [pin, setPin] = useState('');
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [verifyingBio, setVerifyingBio] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setBiometricVerified(false);
      setPinVerified(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBiometricVerify = async () => {
    if (!wallet.biometricCredentialId) return;
    setError(null);
    setVerifyingBio(true);
    try {
      await verifyBiometricCredential(wallet.biometricCredentialId);
      setBiometricVerified(true);
      await recordWalletSecurityEvent(
        wallet.ownerUid,
        'biometric_verified',
        'Biometric passkey verified to authorize P2P transfer.'
      ).catch(() => {});

      if (!requiresBoth || pinVerified) {
        onConfirm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Biometric verification failed.');
    } finally {
      setVerifyingBio(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Enter your 4 to 6 digit Security PIN.');
      return;
    }
    setVerifyingPin(true);
    try {
      const candidateHash = await hashPin(pin, wallet.ownerUid);
      if (candidateHash !== wallet.pinHash) {
        setError('Incorrect Security PIN. Please try again.');
        setPin('');
        return;
      }
      setPinVerified(true);
      setPin('');

      if (!requiresBoth || biometricVerified) {
        onConfirm();
      }
    } finally {
      setVerifyingPin(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-challenge-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-900">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 id="auth-challenge-title" className="font-display text-base font-semibold text-slate-900">
                {title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close authorization dialog"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div role="alert" className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        {hasBiometric && (
          <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <Fingerprint className="w-4 h-4 text-emerald-700" />
                <span>
                  {requiresBoth ? 'Factor 1 · Biometric Passkey' : 'Biometric / Passkey'}
                </span>
              </div>
              {biometricVerified && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified
                </span>
              )}
            </div>
            {!biometricVerified && (
              <button
                type="button"
                onClick={() => void handleBiometricVerify()}
                disabled={verifyingBio}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors"
              >
                <Fingerprint className="w-4 h-4" />
                {verifyingBio ? 'Waiting for Authenticator...' : 'Verify with Biometrics'}
              </button>
            )}
          </div>
        )}

        {hasPin && (
          <form onSubmit={handlePinSubmit} className="space-y-3 p-3.5 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <KeyRound className="w-4 h-4 text-slate-700" />
                <span>
                  {requiresBoth
                    ? 'Factor 2 · Security PIN'
                    : hasBiometric
                    ? 'Alternative · Security PIN'
                    : 'Security PIN'}
                </span>
              </div>
              {pinVerified && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified
                </span>
              )}
            </div>

            {!pinVerified && (
              <>
                <input
                  id="security-pin-verify"
                  type="password"
                  inputMode="numeric"
                  autoFocus={!hasBiometric}
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-4 py-2.5 text-center text-lg font-mono tracking-[0.4em] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="submit"
                  disabled={verifyingPin || pin.length < 4}
                  className="w-full px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {verifyingPin ? 'Verifying...' : 'Authorize with PIN'}
                </button>
              </>
            )}
          </form>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="w-full px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
        >
          Cancel Transfer
        </button>
      </div>
    </div>
  );
};
