import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { LogOut, ShieldCheck, Wallet } from 'lucide-react';
import { BLUEPRINT_LIMITS } from '../types/wallet';
import { extractFriendlyError, formatCDC, parseCDCToCents } from '../lib/crypto';
import { createWallet } from '../services/walletService';
import { ResilientImage } from './ResilientImage';

interface WalletOnboardingProps {
  user: User;
  onSignOut: () => void;
}

const MEDALLION_IMG = '/src/assets/images/cdccoin_vault_emblem_1795242670299.jpg';

export const WalletOnboarding: React.FC<WalletOnboardingProps> = ({ user, onSignOut }) => {
  const defaultName = user.displayName ? `${user.displayName.split(' ')[0]}'s Vault` : 'Primary Demo Vault';
  const [walletName, setWalletName] = useState(defaultName.slice(0, BLUEPRINT_LIMITS.WALLET_NAME_MAX));
  const [dailyLimitInput, setDailyLimitInput] = useState('1000');
  const [pinInput, setPinInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const limitCents = parseCDCToCents(dailyLimitInput);
    if (
      limitCents === null ||
      limitCents < BLUEPRINT_LIMITS.DAILY_LIMIT_MIN_CENTS ||
      limitCents > BLUEPRINT_LIMITS.DAILY_LIMIT_MAX_CENTS
    ) {
      setError('Daily send limit must be between 10.00 and 100,000.00 CDC.');
      return;
    }

    if (pinInput.trim() && !/^\d{4,6}$/.test(pinInput.trim())) {
      setError('Optional Security PIN must be 4 to 6 numeric digits.');
      return;
    }

    setIsCreating(true);
    try {
      await createWallet({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        walletName,
        dailySendLimitCents: limitCents,
        initialPin: pinInput.trim() || undefined,
      });
    } catch (err) {
      setError(extractFriendlyError(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold text-slate-900 whitespace-nowrap shrink-0">
            CDCCoin Wallet
          </span>
          <div className="text-xs text-slate-500 hidden sm:block truncate">
            Signed in as {user.email || user.displayName}
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
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Left summary panel */}
          <div className="md:col-span-5 bg-slate-900 text-white p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
                <ResilientImage
                  src={MEDALLION_IMG}
                  alt="CDCCoin Medallion"
                  fallbackTitle="CDC"
                  className="w-full h-full object-cover"
                />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight [text-wrap:balance]">
                Create Your CDCCoin Wallet
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Provision your personal P2P vault with a unique shareable CDC address and a starting
                demo balance.
              </p>
            </div>

            <div className="pt-6 border-t border-slate-800 space-y-3">
              <div>
                <div className="text-xs text-slate-400">Starting Welcome Grant</div>
                <div className="font-mono tabular-nums text-2xl font-semibold text-emerald-400 mt-0.5">
                  {formatCDC(BLUEPRINT_LIMITS.INITIAL_GRANT_CENTS)}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Protected by Firestore atomic transaction rules</span>
              </div>
            </div>
          </div>

          {/* Right creation form */}
          <form onSubmit={handleCreate} className="md:col-span-7 p-8 space-y-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Vault Configuration
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                You can update your wallet name, limits, and PIN anytime in Security Vault.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
              >
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="wallet-name" className="block text-sm font-medium text-slate-700">
                Wallet Name
              </label>
              <input
                id="wallet-name"
                type="text"
                required
                minLength={BLUEPRINT_LIMITS.WALLET_NAME_MIN}
                maxLength={BLUEPRINT_LIMITS.WALLET_NAME_MAX}
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="Primary Demo Vault"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="daily-limit" className="block text-sm font-medium text-slate-700">
                Daily Send Limit (CDC)
              </label>
              <input
                id="daily-limit"
                type="text"
                inputMode="decimal"
                required
                value={dailyLimitInput}
                onChange={(e) => setDailyLimitInput(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {['500', '1000', '2500', '5000'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDailyLimitInput(preset)}
                    className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md border transition-colors ${
                      dailyLimitInput === preset
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset} CDC
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="initial-pin" className="block text-sm font-medium text-slate-700">
                Security PIN (Optional · 4 to 6 digits)
              </label>
              <input
                id="initial-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 4–6 digit PIN to lock outgoing transfers"
                className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
              />
              <p className="text-xs text-slate-500">
                Hashed locally with SHA-256 before saving. Leave blank to configure later.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isCreating}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors"
              >
                <Wallet className="w-4 h-4" />
                {isCreating ? 'Creating Wallet...' : 'Create CDCCoin Wallet'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};
