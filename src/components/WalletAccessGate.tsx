import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { CheckCircle2, Fingerprint, KeyRound, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { hashPin } from '../lib/crypto';
import { verifyBiometricCredential } from '../lib/webauthn';
import { recordWalletSecurityEvent } from '../services/walletService';
import type { WalletDoc } from '../types/wallet';

interface WalletAccessGateProps {
  user: User;
  wallet: WalletDoc;
  onUnlock: () => void;
  onSignOut: () => void;
}

export const WalletAccessGate: React.FC<WalletAccessGateProps> = ({
  user,
  wallet,
  onUnlock,
  onSignOut,
}) => {
  const hasBiometric = Boolean(wallet.biometricEnabled && wallet.biometricCredentialId);
  const hasPin = Boolean(wallet.pinHash);
  const mode = wallet.biometricMode ?? 'either';
  const requiresBoth = hasBiometric && hasPin && mode === 'both';

  const [biometricVerified, setBiometricVerified] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pin, setPin] = useState('');
  const [verifyingBiometric, setVerifyingBiometric] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishUnlock = async (methodLabel: string) => {
    try {
      await recordWalletSecurityEvent(
        user.uid,
        'wallet_unlocked',
        `Wallet unlocked via ${methodLabel}.`
      );
    } catch {
      // Non-blocking audit log attempt
    }
    onUnlock();
  };

  const handleBiometricVerify = async () => {
    if (!wallet.biometricCredentialId) return;
    setError(null);
    setVerifyingBiometric(true);
    try {
      await verifyBiometricCredential(wallet.biometricCredentialId);
      setBiometricVerified(true);

      if (!requiresBoth || pinVerified) {
        await finishUnlock(
          requiresBoth ? 'WebAuthn Biometric + Security PIN' : 'WebAuthn Biometric'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Biometric verification failed.');
    } finally {
      setVerifyingBiometric(false);
    }
  };

  const handlePinVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Enter your 4 to 6 digit Security PIN.');
      return;
    }
    setVerifyingPin(true);
    try {
      const candidateHash = await hashPin(pin, user.uid);
      if (candidateHash !== wallet.pinHash) {
        setError('Incorrect Security PIN. Please try again.');
        setPin('');
        return;
      }
      setPinVerified(true);
      setPin('');

      if (!requiresBoth || biometricVerified) {
        await finishUnlock(
          requiresBoth ? 'WebAuthn Biometric + Security PIN' : 'Security PIN fallback'
        );
      }
    } finally {
      setVerifyingPin(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <span className="font-display text-lg font-bold text-slate-900 whitespace-nowrap shrink-0">
            CDCCoin Wallet
          </span>
          <div className="text-xs text-slate-500 hidden sm:block truncate">
            {user.email || user.displayName}
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="space-y-2 text-center">
            <div className="w-12 h-12 mx-auto rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="font-display text-xl font-bold text-slate-900">
              Unlock {wallet.walletName}
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              {requiresBoth
                ? 'Two-factor access lock is active. Complete both WebAuthn biometric verification and your Security PIN.'
                : hasPin
                ? 'Verify with your enrolled WebAuthn biometric passkey or your Security PIN to access your wallet.'
                : 'Verify with your enrolled WebAuthn biometric passkey to access your wallet.'}
            </p>
            <div className="text-xs font-mono text-slate-500">{wallet.walletAddress}</div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
            >
              {error}
            </div>
          )}

          {/* Biometric Challenge Section */}
          {hasBiometric && (
            <div className="p-4 border border-slate-200 rounded-xl space-y-3 bg-slate-50/70">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Fingerprint className="w-5 h-5 text-emerald-700 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      Biometric / Passkey Verification
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {wallet.biometricDeviceLabel || 'Enrolled WebAuthn Authenticator'}
                    </div>
                  </div>
                </div>
                {biometricVerified && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                    Verified
                  </span>
                )}
              </div>

              {!biometricVerified && (
                <button
                  type="button"
                  onClick={() => void handleBiometricVerify()}
                  disabled={verifyingBiometric}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors"
                >
                  <Fingerprint className="w-4 h-4" />
                  {verifyingBiometric ? 'Waiting for Authenticator...' : 'Verify with Biometrics'}
                </button>
              )}
            </div>
          )}

          {/* PIN Challenge Section (Shown if PIN is set as Alternative OR Additional factor) */}
          {hasPin && (
            <form
              onSubmit={handlePinVerify}
              className="p-4 border border-slate-200 rounded-xl space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-slate-700" />
                  <span className="text-sm font-semibold text-slate-900">
                    {requiresBoth
                      ? 'Step 2 · Security PIN'
                      : hasBiometric
                      ? 'Alternative · Security PIN'
                      : 'Security PIN'}
                  </span>
                </div>
                {pinVerified && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    Verified
                  </span>
                )}
              </div>

              {!pinVerified && (
                <>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 4–6 digit PIN"
                    className="w-full px-3.5 py-2.5 text-center text-base font-mono tracking-[0.35em] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    type="submit"
                    disabled={verifyingPin || pin.length < 4}
                    className="w-full px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {verifyingPin ? 'Verifying PIN...' : 'Verify Security PIN'}
                  </button>
                </>
              )}
            </form>
          )}

          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Protected by Web Authentication API (FIDO2 / WebAuthn)</span>
          </div>
        </div>
      </main>
    </div>
  );
};
