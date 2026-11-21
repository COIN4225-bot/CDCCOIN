import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Check,
  Coins,
  Copy,
  Download,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Plus,
  QrCode,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  BLUEPRINT_LIMITS,
  type ContactDoc,
  type PaymentRequestDoc,
  type SecurityLogDoc,
  type TransactionDoc,
  type WalletDirectoryDoc,
  type WalletDoc,
  type WorkspaceTab,
} from '../types/wallet';
import {
  extractFriendlyError,
  formatCDC,
  getTodayDateStr,
  parseCDCToCents,
  sanitizeDisplayName,
} from '../lib/crypto';
import {
  cancelPaymentRequest,
  claimDemoFaucet,
  createPaymentRequest,
  lookupPaymentRequest,
  lookupWalletByAddress,
  removeContact,
  saveContact,
  sendP2PCoins,
  updateWalletSettings,
} from '../services/walletService';
import { PinVerificationModal } from './PinVerificationModal';
import { ResilientImage } from './ResilientImage';
import { TransactionReceiptModal } from './TransactionReceiptModal';

interface DashboardWorkspaceProps {
  user: User;
  wallet: WalletDoc;
  transactions: TransactionDoc[];
  transactionsLoading: boolean;
  contacts: ContactDoc[];
  securityLogs: SecurityLogDoc[];
  paymentRequests: PaymentRequestDoc[];
  onSignOut: () => void;
}

const MEDALLION_IMG = '/src/assets/images/cdccoin_vault_emblem_1795242670299.jpg';

const TAB_LABELS: Record<WorkspaceTab, string> = {
  overview: 'Overview',
  send: 'Send Coins',
  receive: 'Receive & Requests',
  transactions: 'Transactions',
  security: 'Security Vault',
};

export const DashboardWorkspace: React.FC<DashboardWorkspaceProps> = ({
  user,
  wallet,
  transactions,
  transactionsLoading,
  contacts,
  securityLogs,
  paymentRequests,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedReqId, setCopiedReqId] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<TransactionDoc | null>(null);

  // Banner feedback
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Faucet state
  const [claimingFaucet, setClaimingFaucet] = useState(false);

  // Send Coins state
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientInfo, setRecipientInfo] = useState<WalletDirectoryDoc | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [sendAmountInput, setSendAmountInput] = useState('');
  const [sendNote, setSendNote] = useState('');
  const [reqLookupInput, setReqLookupInput] = useState('');
  const [activePaymentReq, setActivePaymentReq] = useState<PaymentRequestDoc | null>(null);
  const [sendingTx, setSendingTx] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [saveAfterSend, setSaveAfterSend] = useState(false);
  const [contactNickname, setContactNickname] = useState('');

  // Receive & Request state
  const [reqAmountInput, setReqAmountInput] = useState('');
  const [reqMemoInput, setReqMemoInput] = useState('');
  const [creatingReq, setCreatingReq] = useState(false);

  // Transactions filter state
  const [txSearch, setTxSearch] = useState('');
  const [txFilter, setTxFilter] = useState<'all' | 'sent' | 'received' | 'faucet'>('all');

  // Security Vault state
  const [editWalletName, setEditWalletName] = useState(wallet.walletName);
  const [editDailyLimit, setEditDailyLimit] = useState(String(wallet.dailySendLimitCents / 100));
  const [newPin, setNewPin] = useState('');
  const [editAlertsEnabled, setEditAlertsEnabled] = useState(wallet.alertsEnabled ?? true);
  const [editAlertThresholdPct, setEditAlertThresholdPct] = useState(
    String(wallet.alertThresholdPct ?? BLUEPRINT_LIMITS.DEFAULT_ALERT_THRESHOLD_PCT)
  );
  const [logFilter, setLogFilter] = useState<'all' | 'alerts'>('all');
  const [savingSecurity, setSavingSecurity] = useState(false);

  // Sync security form values when wallet updates
  useEffect(() => {
    setEditWalletName(wallet.walletName);
    setEditDailyLimit(String(wallet.dailySendLimitCents / 100));
    setEditAlertsEnabled(wallet.alertsEnabled ?? true);
    setEditAlertThresholdPct(
      String(wallet.alertThresholdPct ?? BLUEPRINT_LIMITS.DEFAULT_ALERT_THRESHOLD_PCT)
    );
  }, [
    wallet.walletName,
    wallet.dailySendLimitCents,
    wallet.alertsEnabled,
    wallet.alertThresholdPct,
  ]);

  // Support URL deep-links (?pay=CDC-XXXX-XXXX or ?req=req_...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payAddr = params.get('pay');
    const reqId = params.get('req');
    if (payAddr && BLUEPRINT_LIMITS.ADDRESS_REGEX.test(payAddr.toUpperCase())) {
      setActiveTab('send');
      void handleLookupAddress(payAddr.toUpperCase());
    } else if (reqId) {
      setActiveTab('send');
      setReqLookupInput(reqId);
      void handleLoadPaymentRequest(reqId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const todayStr = getTodayDateStr();
  const sentTodayCents = wallet.lastSentDate === todayStr ? wallet.dailySentTodayCents : 0;
  const dailyRemainingCents = Math.max(0, wallet.dailySendLimitCents - sentTodayCents);
  const dailyProgressPct = Math.min(
    100,
    Math.round((sentTodayCents / Math.max(1, wallet.dailySendLimitCents)) * 100)
  );
  const alertsEnabled = wallet.alertsEnabled ?? true;
  const alertThresholdPct =
    wallet.alertThresholdPct ?? BLUEPRINT_LIMITS.DEFAULT_ALERT_THRESHOLD_PCT;
  const alertThresholdCents = Math.round((wallet.dailySendLimitCents * alertThresholdPct) / 100);
  const isLimitReached = alertsEnabled && sentTodayCents >= wallet.dailySendLimitCents;
  const isApproachingLimit =
    alertsEnabled && !isLimitReached && dailyProgressPct >= alertThresholdPct;

  const filteredSecurityLogs = useMemo(() => {
    if (logFilter === 'all') return securityLogs;
    return securityLogs.filter(
      (log) =>
        log.eventType === 'limit_alert_approaching' || log.eventType === 'limit_alert_exceeded'
    );
  }, [securityLogs, logFilter]);

  const summaryStats = useMemo(() => {
    let totalSent = 0;
    let totalReceived = 0;
    for (const tx of transactions) {
      if (tx.fromUid === user.uid) {
        totalSent += tx.amountCents;
      } else if (tx.toUid === user.uid) {
        totalReceived += tx.amountCents;
      }
    }
    return { totalSent, totalReceived };
  }, [transactions, user.uid]);

  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return transactions.filter((tx) => {
      const isOutgoing = tx.fromUid === user.uid;
      if (txFilter === 'sent' && !isOutgoing) return false;
      if (txFilter === 'received' && (isOutgoing || tx.type === 'faucet_grant')) return false;
      if (txFilter === 'faucet' && tx.type !== 'faucet_grant') return false;
      if (!q) return true;
      return (
        tx.txId.toLowerCase().includes(q) ||
        tx.fromName.toLowerCase().includes(q) ||
        tx.toName.toLowerCase().includes(q) ||
        tx.fromAddress.toLowerCase().includes(q) ||
        tx.toAddress.toLowerCase().includes(q) ||
        tx.note.toLowerCase().includes(q)
      );
    });
  }, [transactions, txFilter, txSearch, user.uid]);

  const handleCopyAddress = async () => {
    await navigator.clipboard.writeText(wallet.walletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 1800);
  };

  const handleLookupAddress = async (overrideAddress?: string) => {
    const raw = (overrideAddress ?? recipientInput).trim().toUpperCase();
    setRecipientInput(raw);
    setLookupError(null);
    setRecipientInfo(null);

    if (!BLUEPRINT_LIMITS.ADDRESS_REGEX.test(raw)) {
      setLookupError('Enter a valid address formatted like CDC-XXXX-XXXX.');
      return;
    }
    if (raw === wallet.walletAddress) {
      setLookupError('You cannot transfer Demo Coins to your own wallet address.');
      return;
    }

    setLookupLoading(true);
    try {
      const entry = await lookupWalletByAddress(raw);
      if (!entry) {
        setLookupError('No CDCCoin Wallet found for that address.');
      } else {
        setRecipientInfo(entry);
        setContactNickname(entry.displayName);
      }
    } catch (err) {
      setLookupError(extractFriendlyError(err));
    } finally {
      setLookupLoading(false);
    }
  };

  const handleLoadPaymentRequest = async (overrideId?: string) => {
    const reqId = (overrideId ?? reqLookupInput).trim();
    if (!reqId) return;
    setLookupError(null);
    setLookupLoading(true);
    try {
      const req = await lookupPaymentRequest(reqId);
      if (!req) {
        setLookupError('Payment request not found.');
        setActivePaymentReq(null);
        return;
      }
      if (req.status !== 'open') {
        setLookupError(`Payment request is already ${req.status}.`);
        setActivePaymentReq(null);
        return;
      }
      if (req.requesterUid === user.uid) {
        setLookupError('You cannot fulfill your own payment request.');
        setActivePaymentReq(null);
        return;
      }
      const entry = await lookupWalletByAddress(req.requesterAddress);
      if (!entry) {
        setLookupError('Requester wallet address could not be verified.');
        return;
      }
      setActivePaymentReq(req);
      setRecipientInput(req.requesterAddress);
      setRecipientInfo(entry);
      setSendAmountInput((req.amountCents / 100).toFixed(2));
      setSendNote(req.memo || `Payment Request ${req.reqId}`);
    } catch (err) {
      setLookupError(extractFriendlyError(err));
    } finally {
      setLookupLoading(false);
    }
  };

  const executeTransfer = async () => {
    if (!recipientInfo) return;
    const amountCents = parseCDCToCents(sendAmountInput);
    if (amountCents === null) {
      showToast('error', 'Enter a valid CDC amount (up to 2 decimal places).');
      return;
    }

    setSendingTx(true);
    try {
      const result = await sendP2PCoins({
        senderUid: user.uid,
        senderDisplayName: sanitizeDisplayName(user.displayName, user.email),
        recipient: recipientInfo,
        amountCents,
        note: sendNote,
        paymentRequestId: activePaymentReq?.reqId,
      });

      if (saveAfterSend && contactNickname.trim()) {
        await saveContact(user.uid, recipientInfo.walletAddress, contactNickname.trim());
      }

      if (result.thresholdAlert) {
        showToast(
          'success',
          `Sent ${formatCDC(amountCents)} to ${recipientInfo.displayName}. ${result.thresholdAlert.message}`
        );
      } else {
        showToast(
          'success',
          `Sent ${formatCDC(amountCents)} to ${recipientInfo.displayName} (${result.txId.slice(0, 12)}...).`
        );
      }
      setSendAmountInput('');
      setSendNote('');
      setActivePaymentReq(null);
      setReqLookupInput('');
      setSaveAfterSend(false);
    } catch (err) {
      showToast('error', extractFriendlyError(err));
    } finally {
      setSendingTx(false);
    }
  };

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientInfo) {
      showToast('error', 'Verify a recipient wallet address first.');
      return;
    }
    const amountCents = parseCDCToCents(sendAmountInput);
    if (amountCents === null) {
      showToast('error', 'Enter a valid positive CDC amount.');
      return;
    }
    if (wallet.isFrozen) {
      showToast('error', 'Your wallet is frozen. Unfreeze it in Security Vault first.');
      return;
    }
    if (amountCents > wallet.balanceCents) {
      showToast('error', 'Insufficient Demo Coin balance.');
      return;
    }
    if (amountCents > dailyRemainingCents) {
      showToast('error', `Exceeds today's remaining limit (${formatCDC(dailyRemainingCents)}).`);
      return;
    }

    if (wallet.requirePinForSend && wallet.pinHash) {
      setPinModalOpen(true);
      return;
    }

    void executeTransfer();
  };

  const handleClaimFaucet = async () => {
    setClaimingFaucet(true);
    try {
      await claimDemoFaucet(wallet, sanitizeDisplayName(user.displayName, user.email));
      showToast('success', 'Credited +250.00 CDC from Demo Treasury Faucet.');
    } catch (err) {
      showToast('error', extractFriendlyError(err));
    } finally {
      setClaimingFaucet(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseCDCToCents(reqAmountInput);
    if (amountCents === null) {
      showToast('error', 'Enter a valid request amount.');
      return;
    }
    setCreatingReq(true);
    try {
      const reqId = await createPaymentRequest(
        wallet,
        sanitizeDisplayName(user.displayName, user.email),
        amountCents,
        reqMemoInput
      );
      setReqAmountInput('');
      setReqMemoInput('');
      showToast('success', `Payment Request created (${reqId}). Share the Request ID to get paid.`);
    } catch (err) {
      showToast('error', extractFriendlyError(err));
    } finally {
      setCreatingReq(false);
    }
  };

  const handleExportCSV = () => {
    const header = ['Transaction ID', 'Type', 'Direction', 'From', 'To', 'Amount (CDC)', 'Note', 'Timestamp'];
    const rows = filteredTransactions.map((tx) => {
      const isOutgoing = tx.fromUid === user.uid;
      const dir = tx.type === 'faucet_grant' ? 'Faucet' : isOutgoing ? 'Sent' : 'Received';
      const ts = tx.createdAt ? tx.createdAt.toDate().toISOString() : '';
      const esc = (val: string) => `"${val.replace(/"/g, '""')}"`;
      return [
        esc(tx.txId),
        esc(tx.type),
        esc(dir),
        esc(`${tx.fromName} (${tx.fromAddress})`),
        esc(`${tx.toName} (${tx.toAddress})`),
        (tx.amountCents / 100).toFixed(2),
        esc(tx.note || ''),
        esc(ts),
      ].join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cdccoin-ledger-${wallet.walletAddress}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    const limitCents = parseCDCToCents(editDailyLimit);
    if (
      limitCents === null ||
      limitCents < BLUEPRINT_LIMITS.DAILY_LIMIT_MIN_CENTS ||
      limitCents > BLUEPRINT_LIMITS.DAILY_LIMIT_MAX_CENTS
    ) {
      showToast('error', 'Daily send limit must be between 10.00 and 100,000.00 CDC.');
      return;
    }
    if (newPin && !/^\d{4,6}$/.test(newPin)) {
      showToast('error', 'Security PIN must be 4 to 6 numeric digits.');
      return;
    }

    setSavingSecurity(true);
    try {
      await updateWalletSettings({
        wallet,
        displayName: sanitizeDisplayName(user.displayName, user.email),
        walletName: editWalletName,
        dailySendLimitCents: limitCents,
        newPin: newPin || undefined,
        requirePinForSend: newPin ? true : wallet.requirePinForSend,
        auditEvent: {
          eventType: newPin ? 'pin_updated' : 'limit_updated',
          summary: newPin
            ? 'Updated Security PIN and enabled transfer verification.'
            : `Updated vault settings (Daily Limit: ${formatCDC(limitCents)}).`,
        },
      });
      setNewPin('');
      showToast('success', 'Security settings updated.');
    } catch (err) {
      showToast('error', extractFriendlyError(err));
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleSaveAlertSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPct = Number(editAlertThresholdPct);
    if (
      !Number.isInteger(parsedPct) ||
      parsedPct < BLUEPRINT_LIMITS.ALERT_THRESHOLD_MIN_PCT ||
      parsedPct > BLUEPRINT_LIMITS.ALERT_THRESHOLD_MAX_PCT
    ) {
      showToast('error', 'Alert threshold must be a whole number between 50% and 100%.');
      return;
    }

    setSavingSecurity(true);
    try {
      await updateWalletSettings({
        wallet,
        displayName: sanitizeDisplayName(user.displayName, user.email),
        alertsEnabled: editAlertsEnabled,
        alertThresholdPct: parsedPct,
        auditEvent: {
          eventType: 'alert_settings_updated',
          summary: editAlertsEnabled
            ? `Enabled daily spending limit alerts at ${parsedPct}% (${formatCDC(
                Math.round((wallet.dailySendLimitCents * parsedPct) / 100)
              )}).`
            : 'Disabled daily spending limit threshold alerts.',
        },
      });
      showToast(
        'success',
        editAlertsEnabled
          ? `Spending limit alerts active at ${parsedPct}% of daily limit.`
          : 'Spending limit alerts disabled.'
      );
    } catch (err) {
      showToast('error', extractFriendlyError(err));
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleTogglePinRequirement = async () => {
    if (!wallet.pinHash && !wallet.requirePinForSend) {
      showToast('error', 'Set a 4–6 digit Security PIN below before enabling PIN verification.');
      return;
    }
    setSavingSecurity(true);
    try {
      const next = !wallet.requirePinForSend;
      await updateWalletSettings({
        wallet,
        displayName: sanitizeDisplayName(user.displayName, user.email),
        requirePinForSend: next,
        auditEvent: {
          eventType: 'pin_updated',
          summary: next
            ? 'Enabled Security PIN verification for outgoing transfers.'
            : 'Disabled Security PIN verification for outgoing transfers.',
        },
      });
      showToast('success', next ? 'Transfer PIN protection enabled.' : 'Transfer PIN protection disabled.');
    } catch (err) {
      showToast('error', extractFriendlyError(err));
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleToggleFreeze = async () => {
    setSavingSecurity(true);
    try {
      const nextFrozen = !wallet.isFrozen;
      await updateWalletSettings({
        wallet,
        displayName: sanitizeDisplayName(user.displayName, user.email),
        isFrozen: nextFrozen,
        auditEvent: {
          eventType: nextFrozen ? 'wallet_frozen' : 'wallet_unfrozen',
          summary: nextFrozen
            ? 'Wallet frozen: outgoing and incoming P2P transfers blocked.'
            : 'Wallet unfrozen: P2P transfers restored.',
        },
      });
      showToast('success', nextFrozen ? 'Wallet is now frozen.' : 'Wallet has been unfrozen.');
    } catch (err) {
      showToast('error', extractFriendlyError(err));
    } finally {
      setSavingSecurity(false);
    }
  };

  const navItems: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'send', label: 'Send Coins', icon: <Send className="w-4 h-4" /> },
    { id: 'receive', label: 'Receive & Requests', icon: <QrCode className="w-4 h-4" /> },
    { id: 'transactions', label: 'Transactions', icon: <History className="w-4 h-4" /> },
    { id: 'security', label: 'Security Vault', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            CDCCoin Wallet
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{wallet.walletName}</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Workspace Navigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 truncate">
              {sanitizeDisplayName(user.displayName, user.email)}
            </div>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <span className="truncate">{wallet.walletAddress}</span>
              {copiedAddress ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="px-4 sm:px-8 py-3.5 flex items-center justify-between gap-6">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-display font-bold text-slate-900 lg:hidden whitespace-nowrap">
                CDCCoin Wallet
              </span>
              <span className="hidden lg:inline text-slate-500 whitespace-nowrap">Workspace</span>
              <span className="hidden lg:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="hidden lg:inline font-medium text-slate-900 whitespace-nowrap">
                {TAB_LABELS[activeTab]}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'send' ? 'receive' : 'send')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                {activeTab === 'send' ? (
                  <>
                    <QrCode className="w-4 h-4" />
                    Receive Coins
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Demo Coins
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign Out"
                className="lg:hidden p-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Horizontal Nav */}
          <div className="lg:hidden px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* Explicit Freeze Warning */}
          {wallet.isFrozen && (
            <div
              role="alert"
              className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-amber-950">
                    Wallet Frozen — Transfers Disabled
                  </div>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Outgoing and incoming P2P transfers are currently blocked by your Security Vault.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className="px-3.5 py-2 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
              >
                Manage in Security Vault
              </button>
            </div>
          )}

          {/* Daily Spending Threshold Notification Banner */}
          {(isApproachingLimit || isLimitReached) && (
            <div
              role="status"
              className={`p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isLimitReached
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <BellRing
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    isLimitReached ? 'text-red-700' : 'text-amber-700'
                  }`}
                />
                <div>
                  <div
                    className={`text-sm font-semibold ${
                      isLimitReached ? 'text-red-950' : 'text-amber-950'
                    }`}
                  >
                    {isLimitReached
                      ? 'Daily Spending Limit Reached (100%)'
                      : `Daily Spending Alert: ${dailyProgressPct}% of Limit Used`}
                  </div>
                  <p
                    className={`text-xs mt-0.5 ${
                      isLimitReached ? 'text-red-800' : 'text-amber-800'
                    }`}
                  >
                    Sent {formatCDC(sentTodayCents)} of {formatCDC(wallet.dailySendLimitCents)}{' '}
                    today (Alert threshold: {alertThresholdPct}% ·{' '}
                    {formatCDC(alertThresholdCents)}). Logged in Security Vault.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLogFilter('alerts');
                  setActiveTab('security');
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Inspect Alert Logs
              </button>
            </div>
          )}

          {/* Operation Feedback Toast */}
          {toast && (
            <div
              role="status"
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 text-sm ${
                toast.kind === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Dismiss notification"
                className="p-1 rounded hover:bg-black/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Primary Balance & Vault Card */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{wallet.walletName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{wallet.isFrozen ? 'Frozen' : 'Active Vault'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{wallet.requirePinForSend ? 'PIN Protected' : 'Standard Auth'}</span>
                      </div>
                      <div className="font-mono tabular-nums text-3xl sm:text-4xl font-semibold text-slate-900 mt-2">
                        {formatCDC(wallet.balanceCents)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleClaimFaucet}
                        disabled={
                          claimingFaucet ||
                          wallet.isFrozen ||
                          wallet.balanceCents >= BLUEPRINT_LIMITS.FAUCET_MAX_BALANCE_CENTS
                        }
                        title={
                          wallet.balanceCents >= BLUEPRINT_LIMITS.FAUCET_MAX_BALANCE_CENTS
                            ? 'Available when balance is under 5,000.00 CDC'
                            : 'Claim +250.00 CDC Demo Coins'
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        <Coins className="w-3.5 h-3.5 text-emerald-700" />
                        {claimingFaucet ? 'Minting...' : 'Claim +250 CDC'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('receive')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        QR Receive
                      </button>
                    </div>
                  </div>

                  {/* Daily Limit Progress with Threshold Marker */}
                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600">
                        Daily Outgoing Allowance
                        {alertsEnabled
                          ? ` · Alert at ${alertThresholdPct}% (${formatCDC(alertThresholdCents)})`
                          : ' · Alerts off'}
                      </span>
                      <span className="font-mono tabular-nums text-slate-900 font-medium">
                        {formatCDC(sentTodayCents, false)} / {formatCDC(wallet.dailySendLimitCents)}
                      </span>
                    </div>
                    <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          isLimitReached
                            ? 'bg-red-600'
                            : isApproachingLimit
                            ? 'bg-amber-500'
                            : 'bg-emerald-600'
                        }`}
                        style={{ width: `${dailyProgressPct}%` }}
                      />
                      {alertsEnabled && (
                        <div
                          title={`Alert threshold: ${alertThresholdPct}%`}
                          className="absolute top-0 bottom-0 w-0.5 bg-slate-900/70"
                          style={{ left: `${Math.min(99, alertThresholdPct)}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Address / Medallion Card */}
                <div className="lg:col-span-4 bg-slate-900 text-white rounded-xl p-6 flex flex-col justify-between space-y-5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-700 shrink-0 bg-slate-800">
                      <ResilientImage
                        src={MEDALLION_IMG}
                        alt="CDCCoin Medallion"
                        fallbackTitle="CDC"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400">Your P2P Address</div>
                      <div className="font-mono text-sm font-semibold text-white truncate mt-0.5">
                        {wallet.walletAddress}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800 text-xs">
                    <div>
                      <div className="text-slate-400">Total Received</div>
                      <div className="font-mono tabular-nums text-emerald-400 font-semibold mt-0.5">
                        +{formatCDC(summaryStats.totalReceived)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Total Sent</div>
                      <div className="font-mono tabular-nums text-slate-200 font-semibold mt-0.5">
                        -{formatCDC(summaryStats.totalSent)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors"
                  >
                    {copiedAddress ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Address Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Wallet Address
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Recent Transactions & Quick Contacts */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Recent Activity
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('transactions')}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      View All Ledger
                    </button>
                  </div>

                  {transactionsLoading ? (
                    <div className="p-6 space-y-3">
                      {[1, 2, 3].map((row) => (
                        <div key={row} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <p className="text-sm text-slate-600">
                        No transactions yet. Send demo coins to a peer or claim from the faucet.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('send')}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Make First Transfer
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {transactions.slice(0, 6).map((tx) => {
                        const isOutgoing = tx.fromUid === user.uid;
                        const label =
                          tx.type === 'faucet_grant'
                            ? 'CDCCoin Treasury Faucet'
                            : isOutgoing
                            ? `To ${tx.toName}`
                            : `From ${tx.fromName}`;
                        const subAddr =
                          tx.type === 'faucet_grant'
                            ? 'CDC-TRSY-0000'
                            : isOutgoing
                            ? tx.toAddress
                            : tx.fromAddress;
                        return (
                          <button
                            key={tx.txId}
                            type="button"
                            onClick={() => setSelectedTx(tx)}
                            className="w-full px-6 py-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`p-2 rounded-lg shrink-0 ${
                                  isOutgoing
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {isOutgoing ? (
                                  <ArrowUpRight className="w-4 h-4" />
                                ) : (
                                  <ArrowDownLeft className="w-4 h-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-900 truncate">
                                  {label}
                                </div>
                                <div className="text-xs text-slate-500 font-mono truncate">
                                  {subAddr}
                                  {tx.note ? ` · ${tx.note}` : ''}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div
                                className={`font-mono tabular-nums text-sm font-semibold ${
                                  isOutgoing ? 'text-slate-900' : 'text-emerald-700'
                                }`}
                              >
                                {isOutgoing ? '-' : '+'}
                                {formatCDC(tx.amountCents)}
                              </div>
                              <div className="text-xs text-slate-500">
                                {tx.type === 'faucet_grant'
                                  ? 'Faucet'
                                  : isOutgoing
                                  ? 'Sent'
                                  : 'Received'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Saved Contacts Quick Panel */}
                <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Saved Peers
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('send')}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      Send P2P
                    </button>
                  </div>
                  {contacts.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500 flex-1 flex flex-col justify-center">
                      No saved peers yet. Verify any CDC wallet address in Send Coins to bookmark
                      frequent recipients.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {contacts.slice(0, 5).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setActiveTab('send');
                            void handleLookupAddress(c.walletAddress);
                          }}
                          className="w-full px-6 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {c.nickname}
                            </div>
                            <div className="text-xs font-mono text-slate-500 truncate">
                              {c.walletAddress}
                            </div>
                          </div>
                          <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: SEND COINS */}
          {activeTab === 'send' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900">
                    Send Demo Coins (P2P)
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Available balance:{' '}
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      {formatCDC(wallet.balanceCents)}
                    </span>{' '}
                    · Remaining daily limit:{' '}
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      {formatCDC(dailyRemainingCents)}
                    </span>
                  </p>
                </div>

                {/* Address Lookup */}
                <div className="space-y-2">
                  <label htmlFor="recipient-addr" className="block text-sm font-medium text-slate-700">
                    Recipient Wallet Address
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="recipient-addr"
                      type="text"
                      value={recipientInput}
                      onChange={(e) => {
                        setRecipientInput(e.target.value.toUpperCase());
                        setRecipientInfo(null);
                        setLookupError(null);
                      }}
                      placeholder="CDC-XXXX-XXXX"
                      className="flex-1 px-3.5 py-2.5 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => void handleLookupAddress()}
                      disabled={lookupLoading}
                      className="px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      {lookupLoading ? 'Checking...' : 'Verify'}
                    </button>
                  </div>
                  {lookupError && (
                    <div role="alert" className="text-xs text-red-700 pt-1">
                      {lookupError}
                    </div>
                  )}
                  {recipientInfo && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-emerald-950 truncate">
                            {recipientInfo.displayName} · {recipientInfo.walletName}
                          </div>
                          <div className="text-xs font-mono text-emerald-800">
                            {recipientInfo.walletAddress}
                            {recipientInfo.isFrozen ? ' (Frozen — Transfers Blocked)' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Transfer Form */}
                <form onSubmit={handleSendSubmit} className="space-y-4 pt-2 border-t border-slate-200">
                  <div className="space-y-1.5">
                    <label htmlFor="send-amount" className="block text-sm font-medium text-slate-700">
                      Amount (CDC)
                    </label>
                    <input
                      id="send-amount"
                      type="text"
                      inputMode="decimal"
                      required
                      disabled={Boolean(activePaymentReq)}
                      value={sendAmountInput}
                      onChange={(e) => setSendAmountInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 text-lg font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100"
                    />
                    {!activePaymentReq && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {['25', '50', '100', '250'].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setSendAmountInput(amt)}
                            className="px-2.5 py-1 text-xs font-mono tabular-nums bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors"
                          >
                            {amt} CDC
                          </button>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const previewCents = parseCDCToCents(sendAmountInput);
                      if (!previewCents) return null;
                      const projectedSent = sentTodayCents + previewCents;
                      const projectedPct = Math.round(
                        (projectedSent / Math.max(1, wallet.dailySendLimitCents)) * 100
                      );
                      if (projectedSent > wallet.dailySendLimitCents) {
                        return (
                          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                            <span>
                              Exceeds daily send limit ({formatCDC(wallet.dailySendLimitCents)}).
                              Submitting will be blocked and recorded in Security Logs.
                            </span>
                          </div>
                        );
                      }
                      if (alertsEnabled && projectedPct >= alertThresholdPct) {
                        return (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
                            <BellRing className="w-4 h-4 shrink-0 text-amber-700" />
                            <span>
                              This transfer brings daily spending to {projectedPct}% (
                              {formatCDC(projectedSent)}), crossing your {alertThresholdPct}% alert
                              threshold.
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="send-note" className="block text-sm font-medium text-slate-700">
                      Transfer Note (Optional)
                    </label>
                    <input
                      id="send-note"
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.NOTE_MAX}
                      value={sendNote}
                      onChange={(e) => setSendNote(e.target.value)}
                      placeholder="e.g., Project split, Demo settlement"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  {recipientInfo && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveAfterSend}
                          onChange={(e) => setSaveAfterSend(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                        />
                        <span>Save recipient to Saved Peers</span>
                      </label>
                      {saveAfterSend && (
                        <input
                          type="text"
                          maxLength={BLUEPRINT_LIMITS.NICKNAME_MAX}
                          value={contactNickname}
                          onChange={(e) => setContactNickname(e.target.value)}
                          placeholder="Contact nickname"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                        />
                      )}
                    </div>
                  )}

                  {activePaymentReq && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700">
                        Fulfilling Payment Request <span className="font-mono">{activePaymentReq.reqId}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setActivePaymentReq(null);
                          setSendAmountInput('');
                          setSendNote('');
                        }}
                        className="text-slate-500 hover:text-slate-900 underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sendingTx || !recipientInfo || recipientInfo.isFrozen || wallet.isFrozen}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors"
                  >
                    {wallet.requirePinForSend ? <Lock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {sendingTx
                      ? 'Settling P2P Transfer...'
                      : wallet.requirePinForSend
                      ? 'Verify PIN & Send Coins'
                      : 'Send Demo Coins'}
                  </button>
                </form>
              </div>

              {/* Right Column: Fulfill Payment Request + Saved Peers */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Pay a Request ID
                  </h2>
                  <p className="text-xs text-slate-500">
                    Paste a Payment Request ID shared by another user to auto-fill exact amount and
                    recipient.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={reqLookupInput}
                      onChange={(e) => setReqLookupInput(e.target.value)}
                      placeholder="req_..."
                      className="flex-1 px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => void handleLoadPaymentRequest()}
                      disabled={lookupLoading || !reqLookupInput.trim()}
                      className="px-3.5 py-2 text-xs font-medium text-slate-900 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      Load
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Saved Peers
                    </h2>
                    <span className="text-xs text-slate-500 tabular-nums">{contacts.length}</span>
                  </div>
                  {contacts.length === 0 ? (
                    <div className="p-6 text-xs text-slate-500 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>No saved peers yet. Check &ldquo;Save recipient&rdquo; when sending.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {contacts.map((c) => (
                        <div
                          key={c.id}
                          className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
                        >
                          <button
                            type="button"
                            onClick={() => void handleLookupAddress(c.walletAddress)}
                            className="min-w-0 text-left flex-1"
                          >
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {c.nickname}
                            </div>
                            <div className="text-xs font-mono text-slate-500 truncate">
                              {c.walletAddress}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeContact(user.uid, c.id)}
                            aria-label={`Remove ${c.nickname}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: RECEIVE & REQUESTS */}
          {activeTab === 'receive' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* QR Wallet Card */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5 flex flex-col items-center text-center">
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900">
                    Receive Demo Coins
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Share your QR code or CDC address to receive instant P2P transfers.
                  </p>
                </div>

                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <QRCodeSVG
                    value={wallet.walletAddress}
                    size={184}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                  />
                </div>

                <div className="w-full space-y-2">
                  <div className="text-xs text-slate-500">Your CDCCoin Wallet Address</div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm font-semibold text-slate-900">
                    {wallet.walletAddress}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    {copiedAddress ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        Copied Address
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Address
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Payment Requests Creator & List */}
              <div className="lg:col-span-7 space-y-6">
                <form
                  onSubmit={handleCreateRequest}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div>
                    <h2 className="font-display text-lg font-semibold text-slate-900">
                      Create Payment Request
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Generate a verifiable Request ID for an exact Demo Coin amount.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="req-amount" className="block text-xs font-medium text-slate-700">
                        Amount (CDC)
                      </label>
                      <input
                        id="req-amount"
                        type="text"
                        inputMode="decimal"
                        required
                        value={reqAmountInput}
                        onChange={(e) => setReqAmountInput(e.target.value)}
                        placeholder="50.00"
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="req-memo" className="block text-xs font-medium text-slate-700">
                        Memo (Optional)
                      </label>
                      <input
                        id="req-memo"
                        type="text"
                        maxLength={BLUEPRINT_LIMITS.MEMO_MAX}
                        value={reqMemoInput}
                        onChange={(e) => setReqMemoInput(e.target.value)}
                        placeholder="Lunch split"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={creatingReq}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {creatingReq ? 'Creating...' : 'Create Request'}
                  </button>
                </form>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Your Payment Requests
                    </h2>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {paymentRequests.length}
                    </span>
                  </div>

                  {paymentRequests.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">
                      No payment requests created yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {paymentRequests.map((req) => (
                        <div
                          key={req.reqId}
                          className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                                {formatCDC(req.amountCents)}
                              </span>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span
                                className={`text-xs font-medium ${
                                  req.status === 'paid'
                                    ? 'text-emerald-700'
                                    : req.status === 'cancelled'
                                    ? 'text-slate-400'
                                    : 'text-amber-700'
                                }`}
                              >
                                {req.status === 'paid'
                                  ? 'Paid'
                                  : req.status === 'cancelled'
                                  ? 'Cancelled'
                                  : 'Open'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 truncate mt-0.5">
                              <span className="font-mono">{req.reqId}</span>
                              {req.memo ? ` · ${req.memo}` : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(req.reqId);
                                setCopiedReqId(req.reqId);
                                setTimeout(() => setCopiedReqId(null), 1800);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                              {copiedReqId === req.reqId ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Copy ID
                                </>
                              )}
                            </button>
                            {req.status === 'open' && (
                              <button
                                type="button"
                                onClick={() => void cancelPaymentRequest(req.reqId)}
                                className="px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: TRANSACTIONS */}
          {activeTab === 'transactions' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900">
                    Transaction History
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable P2P and Treasury ledger · Click any row for full receipt
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Search address, ID, note..."
                      className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 w-52"
                    />
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'sent', label: 'Sent' },
                        { id: 'received', label: 'Received' },
                        { id: 'faucet', label: 'Faucet' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTxFilter(tab.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          txFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    disabled={filteredTransactions.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              </div>

              {transactionsLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map((row) => (
                    <div key={row} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    No matching transactions found for the current filter.
                  </p>
                  {txFilter !== 'all' || txSearch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setTxFilter('all');
                        setTxSearch('');
                      }}
                      className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                    >
                      Reset Filters
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-3 px-6">Counterparty</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Address</th>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-6 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredTransactions.map((tx) => {
                        const isOutgoing = tx.fromUid === user.uid;
                        const counterparty =
                          tx.type === 'faucet_grant'
                            ? 'CDCCoin Treasury'
                            : isOutgoing
                            ? tx.toName
                            : tx.fromName;
                        const addr =
                          tx.type === 'faucet_grant'
                            ? 'CDC-TRSY-0000'
                            : isOutgoing
                            ? tx.toAddress
                            : tx.fromAddress;
                        const dateStr = tx.createdAt
                          ? tx.createdAt.toDate().toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Pending';
                        return (
                          <tr
                            key={tx.txId}
                            onClick={() => setSelectedTx(tx)}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-6">
                              <div className="font-medium text-slate-900">{counterparty}</div>
                              {tx.note && (
                                <div className="text-xs text-slate-500 truncate max-w-[240px]">
                                  {tx.note}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                              {tx.type === 'faucet_grant'
                                ? 'Faucet Grant'
                                : isOutgoing
                                ? 'P2P Sent'
                                : 'P2P Received'}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                              {addr}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                              {dateStr}
                            </td>
                            <td
                              className={`py-3 px-6 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                isOutgoing ? 'text-slate-900' : 'text-emerald-700'
                              }`}
                            >
                              {isOutgoing ? '-' : '+'}
                              {formatCDC(tx.amountCents)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: SECURITY VAULT */}
          {activeTab === 'security' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-6">
                {/* PIN & Limits Form */}
                <form
                  onSubmit={handleSaveSecurity}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
                >
                  <div>
                    <h1 className="font-display text-xl font-bold text-slate-900">
                      Security Vault &amp; Controls
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                      Manage wallet name, daily transfer limits, and salted SHA-256 PIN protection.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="sec-wallet-name" className="block text-xs font-medium text-slate-700">
                        Wallet Name
                      </label>
                      <input
                        id="sec-wallet-name"
                        type="text"
                        required
                        minLength={BLUEPRINT_LIMITS.WALLET_NAME_MIN}
                        maxLength={BLUEPRINT_LIMITS.WALLET_NAME_MAX}
                        value={editWalletName}
                        onChange={(e) => setEditWalletName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="sec-daily-limit" className="block text-xs font-medium text-slate-700">
                        Daily Send Limit (CDC)
                      </label>
                      <input
                        id="sec-daily-limit"
                        type="text"
                        inputMode="decimal"
                        required
                        value={editDailyLimit}
                        onChange={(e) => setEditDailyLimit(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="sec-new-pin" className="block text-xs font-medium text-slate-700">
                      {wallet.pinHash ? 'Update Security PIN (4–6 digits)' : 'Set Security PIN (4–6 digits)'}
                    </label>
                    <input
                      id="sec-new-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      placeholder={wallet.pinHash ? 'Leave blank to keep existing PIN' : 'Enter 4–6 digits'}
                      className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleTogglePinRequirement}
                      disabled={savingSecurity}
                      className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 hover:text-slate-900"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      {wallet.requirePinForSend
                        ? 'Transfer PIN: Enabled (Click to disable)'
                        : 'Transfer PIN: Disabled (Click to enable)'}
                    </button>

                    <button
                      type="submit"
                      disabled={savingSecurity}
                      className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      {savingSecurity ? 'Saving...' : 'Save Security Settings'}
                    </button>
                  </div>
                </form>

                {/* Custom Daily Spending Limit Alerts */}
                <form
                  onSubmit={handleSaveAlertSettings}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Daily Spending Limit Alerts
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Log a security alert notification when daily outgoing spending approaches or
                        exceeds your chosen threshold.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditAlertsEnabled((prev) => !prev)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        editAlertsEnabled
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {editAlertsEnabled ? 'Alerts Enabled' : 'Alerts Off'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="alert-threshold-pct" className="font-medium text-slate-700">
                        Approaching Threshold (% of Daily Limit)
                      </label>
                      <span className="font-mono tabular-nums text-slate-900 font-medium">
                        Triggers at{' '}
                        {formatCDC(
                          Math.round(
                            (wallet.dailySendLimitCents *
                              Math.min(100, Math.max(50, Number(editAlertThresholdPct) || 80))) /
                              100
                          )
                        )}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        {['50', '75', '80', '90', '95'].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            disabled={!editAlertsEnabled}
                            onClick={() => setEditAlertThresholdPct(pct)}
                            className={`px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg border transition-colors disabled:opacity-50 ${
                              editAlertThresholdPct === pct
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          id="alert-threshold-pct"
                          type="number"
                          min={BLUEPRINT_LIMITS.ALERT_THRESHOLD_MIN_PCT}
                          max={BLUEPRINT_LIMITS.ALERT_THRESHOLD_MAX_PCT}
                          disabled={!editAlertsEnabled}
                          value={editAlertThresholdPct}
                          onChange={(e) => setEditAlertThresholdPct(e.target.value)}
                          className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100"
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-slate-200">
                    <button
                      type="submit"
                      disabled={savingSecurity}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      {savingSecurity ? 'Saving...' : 'Save Alert Rules'}
                    </button>
                  </div>
                </form>

                {/* Emergency Freeze Panel */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        wallet.isFrozen ? 'text-amber-600' : 'text-slate-600'
                      }`}
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {wallet.isFrozen ? 'Wallet is Frozen' : 'Emergency Wallet Freeze'}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {wallet.isFrozen
                          ? 'Unfreeze your wallet to resume sending and receiving Demo Coins.'
                          : 'Immediately lock all outgoing and incoming P2P transfers at the database layer.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleFreeze}
                    disabled={savingSecurity}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      wallet.isFrozen
                        ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                        : 'bg-red-700 text-white hover:bg-red-800'
                    }`}
                  >
                    {wallet.isFrozen ? 'Unfreeze Wallet' : 'Freeze Wallet'}
                  </button>
                </div>
              </div>

              {/* Security Audit Log */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Security Audit Trail
                    </h2>
                  </div>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setLogFilter('all')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        logFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({securityLogs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogFilter('alerts')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        logFilter === 'alerts'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Limit Alerts
                    </button>
                  </div>
                </div>
                {filteredSecurityLogs.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500">
                    {logFilter === 'alerts'
                      ? 'No daily spending limit alert notifications recorded yet.'
                      : 'No security events recorded yet.'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
                    {filteredSecurityLogs.map((log) => {
                      const isExceeded = log.eventType === 'limit_alert_exceeded';
                      const isApproaching = log.eventType === 'limit_alert_approaching';
                      const label = isExceeded
                        ? 'Spending Alert · Limit Exceeded'
                        : isApproaching
                        ? 'Spending Alert · Approaching Limit'
                        : log.eventType.replace(/_/g, ' ');
                      return (
                        <div
                          key={log.id}
                          className={`px-6 py-3.5 space-y-1 ${
                            isExceeded
                              ? 'bg-red-50/50'
                              : isApproaching
                              ? 'bg-amber-50/50'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span
                              className={`inline-flex items-center gap-1.5 font-medium ${
                                isExceeded
                                  ? 'text-red-800'
                                  : isApproaching
                                  ? 'text-amber-900'
                                  : 'text-slate-900'
                              }`}
                            >
                              {(isExceeded || isApproaching) && (
                                <BellRing className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{label}</span>
                            </span>
                            <span className="font-mono tabular-nums text-slate-400 shrink-0">
                              {log.createdAt
                                ? log.createdAt.toDate().toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Pending'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{log.summary}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Security PIN Challenge Modal */}
      <PinVerificationModal
        isOpen={pinModalOpen}
        uid={user.uid}
        expectedPinHash={wallet.pinHash}
        title="Authorize P2P Transfer"
        subtitle={`Enter your PIN to send ${sendAmountInput || '0'} CDC to ${recipientInfo?.displayName || 'recipient'}`}
        onConfirm={() => {
          setPinModalOpen(false);
          void executeTransfer();
        }}
        onCancel={() => setPinModalOpen(false)}
      />

      {/* Transaction Receipt Modal */}
      <TransactionReceiptModal
        tx={selectedTx}
        currentUid={user.uid}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
};
