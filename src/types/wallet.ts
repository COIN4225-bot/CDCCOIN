import type { Timestamp } from 'firebase/firestore';

export const BLUEPRINT_LIMITS = {
  WALLET_NAME_MIN: 2,
  WALLET_NAME_MAX: 40,
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 40,
  NICKNAME_MIN: 1,
  NICKNAME_MAX: 40,
  NOTE_MAX: 140,
  MEMO_MAX: 100,
  SUMMARY_MIN: 3,
  SUMMARY_MAX: 140,
  INITIAL_GRANT_CENTS: 100000, // 1,000.00 CDC
  FAUCET_AMOUNT_CENTS: 25000, // 250.00 CDC
  FAUCET_MAX_BALANCE_CENTS: 500000, // 5,000.00 CDC
  DAILY_LIMIT_MIN_CENTS: 1000, // 10.00 CDC
  DAILY_LIMIT_MAX_CENTS: 10000000, // 100,000.00 CDC
  ALERT_THRESHOLD_MIN_PCT: 50,
  ALERT_THRESHOLD_MAX_PCT: 100,
  DEFAULT_ALERT_THRESHOLD_PCT: 80,
  TX_MAX_CENTS: 10000000, // 100,000.00 CDC
  ADDRESS_REGEX: /^CDC-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
} as const;

export interface WalletDoc {
  ownerUid: string;
  walletAddress: string;
  walletName: string;
  balanceCents: number;
  dailySendLimitCents: number;
  dailySentTodayCents: number;
  lastSentDate: string;
  isFrozen: boolean;
  requirePinForSend: boolean;
  pinHash: string;
  lastTxId: string;
  alertsEnabled?: boolean;
  alertThresholdPct?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WalletDirectoryDoc {
  walletAddress: string;
  ownerUid: string;
  displayName: string;
  walletName: string;
  isFrozen: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TransactionType = 'p2p_transfer' | 'faucet_grant';

export interface TransactionDoc {
  txId: string;
  type: TransactionType;
  fromUid: string;
  fromAddress: string;
  fromName: string;
  toUid: string;
  toAddress: string;
  toName: string;
  participants: [string, string];
  amountCents: number;
  note: string;
  status: 'completed';
  createdAt: Timestamp;
}

export interface ContactDoc {
  id: string;
  ownerUid: string;
  walletAddress: string;
  nickname: string;
  createdAt: Timestamp;
}

export type SecurityEventType =
  | 'wallet_created'
  | 'pin_updated'
  | 'wallet_frozen'
  | 'wallet_unfrozen'
  | 'limit_updated'
  | 'alert_settings_updated'
  | 'limit_alert_approaching'
  | 'limit_alert_exceeded'
  | 'p2p_sent'
  | 'faucet_claimed';

export interface SecurityLogDoc {
  id: string;
  ownerUid: string;
  eventType: SecurityEventType;
  summary: string;
  createdAt: Timestamp;
}

export type PaymentRequestStatus = 'open' | 'paid' | 'cancelled';

export interface PaymentRequestDoc {
  reqId: string;
  requesterUid: string;
  requesterAddress: string;
  requesterName: string;
  amountCents: number;
  memo: string;
  status: PaymentRequestStatus;
  paidByUid: string;
  paidTxId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type WorkspaceTab = 'overview' | 'send' | 'receive' | 'transactions' | 'security';
