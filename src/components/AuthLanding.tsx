import React from 'react';
import { ArrowRight, KeyRound, Lock, QrCode, Send, ShieldCheck } from 'lucide-react';
import { ResilientImage } from './ResilientImage';

interface AuthLandingProps {
  onSignIn: () => void;
  isSigningIn: boolean;
  authError: string | null;
}

const VAULT_HERO_IMG = '/src/assets/images/cdccoin_hero_vault_1795242670335.jpg';
const MEDALLION_IMG = '/src/assets/images/cdccoin_vault_emblem_1795242670299.jpg';

export const AuthLanding: React.FC<AuthLandingProps> = ({
  onSignIn,
  isSigningIn,
  authError,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: Brand wordmark — 4 concise nav links — 1 primary CTA */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            CDCCoin Wallet
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#overview"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Overview
            </a>
            <a
              href="#features"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
            <a
              href="#security"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Security
            </a>
            <a
              href="#ledger"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              P2P Ledger
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              disabled={isSigningIn}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {isSigningIn ? 'Connecting...' : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split */}
        <section id="overview" className="max-w-6xl mx-auto px-6 pt-12 pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="text-xs font-medium text-emerald-700 tracking-wide">
                Peer-to-Peer DemoCoin Treasury
              </div>
              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12] [text-wrap:balance]">
                Send, Receive, aur Manage Demo Coins easily
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                CDCCoin Wallet is a secure P2P wallet built for instant demo coin transfers,
                QR-ready wallet addresses, real-time transaction tracking, and layered vault
                protections including PIN verification, daily send limits, and instant freeze.
              </p>

              {authError && (
                <div
                  role="alert"
                  className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
                >
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 whitespace-nowrap shrink-0"
                >
                  {isSigningIn ? 'Signing in with Google...' : 'Create or Open Wallet'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-2">
                <span>1,000.00 CDC Welcome Grant</span>
                <span aria-hidden="true">·</span>
                <span>Atomic P2P Ledger</span>
                <span aria-hidden="true">·</span>
                <span>Google Verified Accounts</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[340px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
                <ResilientImage
                  src={VAULT_HERO_IMG}
                  alt="Minimalist architectural CDCCoin digital treasury vault"
                  fallbackTitle="CDCCoin Treasury Vault"
                  className="w-full h-full lg:h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-6 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/20 shrink-0 bg-slate-900">
                    <ResilientImage
                      src={MEDALLION_IMG}
                      alt="CDCCoin metallic medallion"
                      fallbackTitle="CDC"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      Instant Wallet Provisioning
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Receive a unique CDC address and 1,000.00 CDC demo balance on setup
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Summary Strip below Hero */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10 pt-10 border-t border-slate-200">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Initial Grant</div>
              <div className="font-mono tabular-nums text-xl font-semibold text-slate-900 mt-1">
                1,000.00 CDC
              </div>
              <div className="text-xs text-slate-500 mt-1">Issued on wallet creation</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Transfer Model</div>
              <div className="font-display text-xl font-semibold text-slate-900 mt-1">
                Atomic P2P
              </div>
              <div className="text-xs text-slate-500 mt-1">Simultaneous debit &amp; credit</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Vault Controls</div>
              <div className="font-display text-xl font-semibold text-slate-900 mt-1">
                PIN &amp; Freeze
              </div>
              <div className="text-xs text-slate-500 mt-1">Salted SHA-256 + daily caps</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Directory Privacy</div>
              <div className="font-display text-xl font-semibold text-slate-900 mt-1">
                Zero PII
              </div>
              <div className="text-xs text-slate-500 mt-1">Address-only recipient lookup</div>
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section id="features" className="bg-white border-y border-slate-200 py-16">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-2xl mb-10">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 [text-wrap:balance]">
                Designed for effortless peer-to-peer demo coin management
              </h2>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Every core workflow—creating your vault, sending to peers, sharing QR codes, and
                auditing security—operates with clear rules and real-time persistence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <Send className="w-5 h-5 text-emerald-700" />
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  01. Instant P2P Transfers
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Look up any recipient by their CDC wallet address, save trusted contacts, attach
                  transfer notes, and settle balances atomically.
                </p>
              </div>

              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <QrCode className="w-5 h-5 text-emerald-700" />
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  02. QR &amp; Payment Requests
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Share your scannable wallet QR code or generate specific payment request IDs that
                  verify exact amount settlement.
                </p>
              </div>

              <div id="ledger" className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <KeyRound className="w-5 h-5 text-emerald-700" />
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  03. Immutable Ledger &amp; Export
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Filter every incoming, outgoing, and faucet transaction in real time, inspect full
                  receipts, or export statements as CSV.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Security Architecture */}
        <section id="security" className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-square max-w-sm mx-auto">
                <ResilientImage
                  src={MEDALLION_IMG}
                  alt="CDCCoin security medallion"
                  fallbackTitle="CDCCoin Security Vault"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="lg:col-span-7 space-y-5">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 [text-wrap:balance]">
                Layered protection built into every transaction
              </h2>
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                <div className="py-4 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Salted SHA-256 Transfer PIN
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">
                      Require a 4 to 6 digit PIN before authorizing any outgoing transfer. PINs are
                      hashed locally in your browser and never stored in plaintext.
                    </p>
                  </div>
                </div>
                <div className="py-4 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Daily Send Limits &amp; Instant Wallet Freeze
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">
                      Configure daily spending caps and freeze your wallet anytime—enforced directly
                      at the database rule layer alongside an immutable security audit log.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>CDCCoin Wallet · P2P Demo Coin Management</span>
          <span>Demo currency for peer-to-peer testing and education</span>
        </div>
      </footer>
    </div>
  );
};
