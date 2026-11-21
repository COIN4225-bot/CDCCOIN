import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  BLUEPRINT_LIMITS,
  type BiometricMode,
  type PaymentRequestDoc,
  type SecurityEventType,
  type WalletDirectoryDoc,
  type WalletDoc,
} from '../types/wallet';
import {
  formatCDC,
  generateId,
  generateWalletAddress,
  getTodayDateStr,
  hashPin,
  sanitizeDisplayName,
} from '../lib/crypto';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export interface CreateWalletParams {
  uid: string;
  displayName: string | null;
  email: string | null;
  walletName: string;
  dailySendLimitCents: number;
  initialPin?: string;
  alertThresholdPct?: number;
}

export async function createWallet(params: CreateWalletParams): Promise<string> {
  const {
    uid,
    displayName,
    email,
    walletName,
    dailySendLimitCents,
    initialPin,
    alertThresholdPct = BLUEPRINT_LIMITS.DEFAULT_ALERT_THRESHOLD_PCT,
  } = params;

  const trimmedWalletName = walletName.trim().slice(0, BLUEPRINT_LIMITS.WALLET_NAME_MAX);
  if (trimmedWalletName.length < BLUEPRINT_LIMITS.WALLET_NAME_MIN) {
    throw new Error('Wallet name must be at least 2 characters.');
  }
  if (
    dailySendLimitCents < BLUEPRINT_LIMITS.DAILY_LIMIT_MIN_CENTS ||
    dailySendLimitCents > BLUEPRINT_LIMITS.DAILY_LIMIT_MAX_CENTS
  ) {
    throw new Error('Daily send limit must be between 10.00 CDC and 100,000.00 CDC.');
  }
  if (
    !Number.isInteger(alertThresholdPct) ||
    alertThresholdPct < BLUEPRINT_LIMITS.ALERT_THRESHOLD_MIN_PCT ||
    alertThresholdPct > BLUEPRINT_LIMITS.ALERT_THRESHOLD_MAX_PCT
  ) {
    throw new Error('Alert threshold must be between 50% and 100%.');
  }

  let pinHash = '';
  let requirePinForSend = false;
  if (initialPin && initialPin.trim().length > 0) {
    if (!/^\d{4,6}$/.test(initialPin.trim())) {
      throw new Error('Security PIN must be 4 to 6 digits.');
    }
    pinHash = await hashPin(initialPin.trim(), uid);
    requirePinForSend = true;
  }

  let walletAddress = generateWalletAddress(uid);
  for (let attempt = 0; attempt < 5; attempt++) {
    const existingDir = await getDoc(doc(db, 'wallet_directory', walletAddress));
    if (!existingDir.exists()) {
      break;
    }
    walletAddress = generateWalletAddress(uid);
  }

  const safeDisplayName = sanitizeDisplayName(displayName, email);
  const walletRef = doc(db, 'wallets', uid);
  const directoryRef = doc(db, 'wallet_directory', walletAddress);
  const logId = generateId('sec');
  const logRef = doc(db, 'wallets', uid, 'security_logs', logId);

  const batch = writeBatch(db);
  batch.set(walletRef, {
    ownerUid: uid,
    walletAddress,
    walletName: trimmedWalletName,
    balanceCents: BLUEPRINT_LIMITS.INITIAL_GRANT_CENTS,
    dailySendLimitCents,
    dailySentTodayCents: 0,
    lastSentDate: '',
    isFrozen: false,
    requirePinForSend,
    pinHash,
    lastTxId: '',
    alertsEnabled: true,
    alertThresholdPct,
    biometricEnabled: false,
    biometricCredentialId: '',
    biometricDeviceLabel: '',
    requireBiometricForAccess: false,
    biometricMode: 'either' satisfies BiometricMode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(directoryRef, {
    walletAddress,
    ownerUid: uid,
    displayName: safeDisplayName,
    walletName: trimmedWalletName,
    isFrozen: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(logRef, {
    ownerUid: uid,
    eventType: 'wallet_created' satisfies SecurityEventType,
    summary: `Wallet ${walletAddress} created with ${formatCDC(BLUEPRINT_LIMITS.INITIAL_GRANT_CENTS)} welcome grant.`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return walletAddress;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `wallets/${uid}`);
  }
}

export async function lookupWalletByAddress(rawAddress: string): Promise<WalletDirectoryDoc | null> {
  const normalized = rawAddress.trim().toUpperCase();
  if (!BLUEPRINT_LIMITS.ADDRESS_REGEX.test(normalized)) {
    return null;
  }
  const path = `wallet_directory/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'wallet_directory', normalized));
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as WalletDirectoryDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function lookupPaymentRequest(rawReqId: string): Promise<PaymentRequestDoc | null> {
  const trimmed = rawReqId.trim();
  if (!trimmed || !BLUEPRINT_LIMITS.ID_REGEX.test(trimmed)) {
    return null;
  }
  const path = `payment_requests/${trimmed}`;
  try {
    const snap = await getDoc(doc(db, 'payment_requests', trimmed));
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as PaymentRequestDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export interface SendP2PParams {
  senderUid: string;
  senderDisplayName: string;
  recipient: WalletDirectoryDoc;
  amountCents: number;
  note: string;
  paymentRequestId?: string;
}

export interface ThresholdAlertResult {
  level: 'approaching' | 'exceeded';
  pct: number;
  message: string;
}

export interface SendP2PResult {
  txId: string;
  thresholdAlert?: ThresholdAlertResult;
}

export async function recordWalletSecurityEvent(
  uid: string,
  eventType: SecurityEventType,
  summary: string
): Promise<void> {
  await writeSecurityLog(uid, eventType, summary);
}

async function writeSecurityLog(
  uid: string,
  eventType: SecurityEventType,
  summary: string
): Promise<void> {
  const logId = generateId('sec');
  const path = `wallets/${uid}/security_logs/${logId}`;
  try {
    await setDoc(doc(db, 'wallets', uid, 'security_logs', logId), {
      ownerUid: uid,
      eventType,
      summary: summary.slice(0, BLUEPRINT_LIMITS.SUMMARY_MAX),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function sendP2PCoins(params: SendP2PParams): Promise<SendP2PResult> {
  const { senderUid, senderDisplayName, recipient, amountCents, note, paymentRequestId } = params;

  if (recipient.ownerUid === senderUid) {
    throw new Error('Cannot send Demo Coins to your own wallet address.');
  }
  if (recipient.isFrozen) {
    throw new Error('Recipient wallet is currently frozen and cannot receive transfers.');
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > BLUEPRINT_LIMITS.TX_MAX_CENTS) {
    throw new Error('Transfer amount must be between 0.01 CDC and 100,000.00 CDC.');
  }

  const sanitizedNote = note.trim().slice(0, BLUEPRINT_LIMITS.NOTE_MAX);
  const senderWalletRef = doc(db, 'wallets', senderUid);

  let freshSender: WalletDoc;
  try {
    const senderSnap = await getDoc(senderWalletRef);
    if (!senderSnap.exists()) {
      throw new Error('Sender wallet not found.');
    }
    freshSender = senderSnap.data() as WalletDoc;
  } catch (error) {
    if (error instanceof Error && error.message === 'Sender wallet not found.') {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, `wallets/${senderUid}`);
  }

  if (freshSender.isFrozen) {
    throw new Error('Your wallet is frozen. Unfreeze it in Security Vault before sending.');
  }
  if (freshSender.balanceCents < amountCents) {
    throw new Error('Insufficient Demo Coin balance for this transfer.');
  }

  const today = getTodayDateStr();
  const prevDailySent = freshSender.lastSentDate === today ? freshSender.dailySentTodayCents : 0;
  const nextDailySent = prevDailySent + amountCents;
  const alertsEnabled = freshSender.alertsEnabled ?? true;
  const alertThresholdPct =
    freshSender.alertThresholdPct ?? BLUEPRINT_LIMITS.DEFAULT_ALERT_THRESHOLD_PCT;

  if (nextDailySent > freshSender.dailySendLimitCents) {
    const remaining = Math.max(0, freshSender.dailySendLimitCents - prevDailySent);
    const attemptedPct = Math.round((nextDailySent / freshSender.dailySendLimitCents) * 100);
    if (alertsEnabled) {
      await writeSecurityLog(
        senderUid,
        'limit_alert_exceeded',
        `Limit exceeded alert: Attempted ${formatCDC(amountCents)} transfer would reach ${attemptedPct}% of ${formatCDC(freshSender.dailySendLimitCents)} daily limit.`
      );
    }
    throw new Error(
      `Exceeds daily send limit (${formatCDC(freshSender.dailySendLimitCents)}). Remaining allowance today: ${formatCDC(remaining)}. Security log updated.`
    );
  }

  const txId = generateId('tx');
  const txRef = doc(db, 'transactions', txId);
  const receiverWalletRef = doc(db, 'wallets', recipient.ownerUid);
  const logRef = doc(db, 'wallets', senderUid, 'security_logs', generateId('sec'));

  const batch = writeBatch(db);

  batch.set(txRef, {
    txId,
    type: 'p2p_transfer',
    fromUid: senderUid,
    fromAddress: freshSender.walletAddress,
    fromName: sanitizeDisplayName(senderDisplayName, null).slice(0, 50),
    toUid: recipient.ownerUid,
    toAddress: recipient.walletAddress,
    toName: recipient.displayName.slice(0, 50),
    participants: [senderUid, recipient.ownerUid],
    amountCents,
    note: sanitizedNote,
    status: 'completed',
    createdAt: serverTimestamp(),
  });

  batch.update(senderWalletRef, {
    balanceCents: freshSender.balanceCents - amountCents,
    dailySentTodayCents: nextDailySent,
    lastSentDate: today,
    lastTxId: txId,
    updatedAt: serverTimestamp(),
  });

  batch.update(receiverWalletRef, {
    balanceCents: increment(amountCents),
    lastTxId: txId,
    updatedAt: serverTimestamp(),
  });

  if (paymentRequestId) {
    const reqRef = doc(db, 'payment_requests', paymentRequestId);
    batch.update(reqRef, {
      status: 'paid',
      paidByUid: senderUid,
      paidTxId: txId,
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(logRef, {
    ownerUid: senderUid,
    eventType: 'p2p_sent' satisfies SecurityEventType,
    summary: `Sent ${formatCDC(amountCents)} to ${recipient.walletAddress} (${recipient.displayName}).`.slice(
      0,
      BLUEPRINT_LIMITS.SUMMARY_MAX
    ),
    createdAt: serverTimestamp(),
  });

  let thresholdAlert: ThresholdAlertResult | undefined;
  const usagePct = Math.round((nextDailySent / freshSender.dailySendLimitCents) * 100);

  if (alertsEnabled) {
    if (nextDailySent === freshSender.dailySendLimitCents) {
      const alertLogRef = doc(db, 'wallets', senderUid, 'security_logs', generateId('sec'));
      const msg = `Daily limit reached (100%): ${formatCDC(nextDailySent)} / ${formatCDC(freshSender.dailySendLimitCents)} sent today.`;
      batch.set(alertLogRef, {
        ownerUid: senderUid,
        eventType: 'limit_alert_exceeded' satisfies SecurityEventType,
        summary: msg.slice(0, BLUEPRINT_LIMITS.SUMMARY_MAX),
        createdAt: serverTimestamp(),
      });
      thresholdAlert = { level: 'exceeded', pct: 100, message: msg };
    } else if (usagePct >= alertThresholdPct) {
      const alertLogRef = doc(db, 'wallets', senderUid, 'security_logs', generateId('sec'));
      const msg = `Spending alert: Daily usage reached ${usagePct}% (${formatCDC(nextDailySent)} / ${formatCDC(freshSender.dailySendLimitCents)}), crossing ${alertThresholdPct}% threshold.`;
      batch.set(alertLogRef, {
        ownerUid: senderUid,
        eventType: 'limit_alert_approaching' satisfies SecurityEventType,
        summary: msg.slice(0, BLUEPRINT_LIMITS.SUMMARY_MAX),
        createdAt: serverTimestamp(),
      });
      thresholdAlert = { level: 'approaching', pct: usagePct, message: msg };
    }
  }

  try {
    await batch.commit();
    return { txId, thresholdAlert };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${txId}`);
  }
}

export async function claimDemoFaucet(wallet: WalletDoc, recipientName: string): Promise<string> {
  if (wallet.isFrozen) {
    throw new Error('Wallet is frozen. Unfreeze it before claiming demo coins.');
  }
  if (wallet.balanceCents >= BLUEPRINT_LIMITS.FAUCET_MAX_BALANCE_CENTS) {
    throw new Error('Faucet is available when your balance is below 5,000.00 CDC.');
  }

  const txId = generateId('faucet');
  const txRef = doc(db, 'transactions', txId);
  const walletRef = doc(db, 'wallets', wallet.ownerUid);
  const logRef = doc(db, 'wallets', wallet.ownerUid, 'security_logs', generateId('sec'));

  const batch = writeBatch(db);

  batch.set(txRef, {
    txId,
    type: 'faucet_grant',
    fromUid: 'CDC_TREASURY',
    fromAddress: 'CDC-TRSY-0000',
    fromName: 'CDCCoin Treasury',
    toUid: wallet.ownerUid,
    toAddress: wallet.walletAddress,
    toName: sanitizeDisplayName(recipientName, null).slice(0, 50),
    participants: ['CDC_TREASURY', wallet.ownerUid],
    amountCents: BLUEPRINT_LIMITS.FAUCET_AMOUNT_CENTS,
    note: 'Demo Coin Treasury Faucet Drop',
    status: 'completed',
    createdAt: serverTimestamp(),
  });

  batch.update(walletRef, {
    balanceCents: wallet.balanceCents + BLUEPRINT_LIMITS.FAUCET_AMOUNT_CENTS,
    lastTxId: txId,
    updatedAt: serverTimestamp(),
  });

  batch.set(logRef, {
    ownerUid: wallet.ownerUid,
    eventType: 'faucet_claimed' satisfies SecurityEventType,
    summary: `Claimed +${formatCDC(BLUEPRINT_LIMITS.FAUCET_AMOUNT_CENTS)} from CDCCoin Demo Faucet.`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return txId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${txId}`);
  }
}

export interface UpdateWalletSettingsParams {
  wallet: WalletDoc;
  displayName: string;
  walletName?: string;
  dailySendLimitCents?: number;
  isFrozen?: boolean;
  requirePinForSend?: boolean;
  newPin?: string;
  alertsEnabled?: boolean;
  alertThresholdPct?: number;
  biometricEnabled?: boolean;
  biometricCredentialId?: string;
  biometricDeviceLabel?: string;
  requireBiometricForAccess?: boolean;
  biometricMode?: BiometricMode;
  auditEvent?: {
    eventType: SecurityEventType;
    summary: string;
  };
}

export async function updateWalletSettings(params: UpdateWalletSettingsParams): Promise<void> {
  const {
    wallet,
    displayName,
    walletName,
    dailySendLimitCents,
    isFrozen,
    requirePinForSend,
    newPin,
    alertsEnabled,
    alertThresholdPct,
    biometricEnabled,
    biometricCredentialId,
    biometricDeviceLabel,
    requireBiometricForAccess,
    biometricMode,
    auditEvent,
  } = params;

  const nextWalletName = (walletName ?? wallet.walletName).trim().slice(0, BLUEPRINT_LIMITS.WALLET_NAME_MAX);
  if (nextWalletName.length < BLUEPRINT_LIMITS.WALLET_NAME_MIN) {
    throw new Error('Wallet name must be at least 2 characters.');
  }

  const nextLimit = dailySendLimitCents ?? wallet.dailySendLimitCents;
  if (
    !Number.isInteger(nextLimit) ||
    nextLimit < BLUEPRINT_LIMITS.DAILY_LIMIT_MIN_CENTS ||
    nextLimit > BLUEPRINT_LIMITS.DAILY_LIMIT_MAX_CENTS
  ) {
    throw new Error('Daily send limit must be between 10.00 CDC and 100,000.00 CDC.');
  }

  const nextAlertsEnabled = alertsEnabled ?? wallet.alertsEnabled ?? true;
  const nextThresholdPct =
    alertThresholdPct ?? wallet.alertThresholdPct ?? BLUEPRINT_LIMITS.DEFAULT_ALERT_THRESHOLD_PCT;
  if (
    !Number.isInteger(nextThresholdPct) ||
    nextThresholdPct < BLUEPRINT_LIMITS.ALERT_THRESHOLD_MIN_PCT ||
    nextThresholdPct > BLUEPRINT_LIMITS.ALERT_THRESHOLD_MAX_PCT
  ) {
    throw new Error('Alert threshold must be between 50% and 100%.');
  }

  let nextPinHash = wallet.pinHash;
  if (newPin !== undefined) {
    if (newPin === '') {
      nextPinHash = '';
    } else if (!/^\d{4,6}$/.test(newPin)) {
      throw new Error('Security PIN must be 4 to 6 digits.');
    } else {
      nextPinHash = await hashPin(newPin, wallet.ownerUid);
    }
  }

  const nextRequirePin = requirePinForSend ?? wallet.requirePinForSend;
  if (nextRequirePin && !nextPinHash) {
    throw new Error('Set a 4 to 6 digit Security PIN before enabling PIN verification.');
  }

  const nextFrozen = isFrozen ?? wallet.isFrozen;
  const nextBiometricEnabled = biometricEnabled ?? wallet.biometricEnabled ?? false;
  const nextBiometricCredentialId = (biometricCredentialId ?? wallet.biometricCredentialId ?? '').slice(0, 256);
  const nextBiometricDeviceLabel = (biometricDeviceLabel ?? wallet.biometricDeviceLabel ?? '').trim().slice(0, BLUEPRINT_LIMITS.BIOMETRIC_LABEL_MAX);
  const nextRequireBiometricForAccess = nextBiometricEnabled
    ? (requireBiometricForAccess ?? wallet.requireBiometricForAccess ?? false)
    : false;
  const nextBiometricMode: BiometricMode = biometricMode ?? wallet.biometricMode ?? 'either';

  const batch = writeBatch(db);
  const walletRef = doc(db, 'wallets', wallet.ownerUid);
  const dirRef = doc(db, 'wallet_directory', wallet.walletAddress);

  batch.update(walletRef, {
    walletName: nextWalletName,
    dailySendLimitCents: nextLimit,
    isFrozen: nextFrozen,
    requirePinForSend: nextRequirePin,
    pinHash: nextPinHash,
    alertsEnabled: nextAlertsEnabled,
    alertThresholdPct: nextThresholdPct,
    biometricEnabled: nextBiometricEnabled,
    biometricCredentialId: nextBiometricCredentialId,
    biometricDeviceLabel: nextBiometricDeviceLabel,
    requireBiometricForAccess: nextRequireBiometricForAccess,
    biometricMode: nextBiometricMode,
    updatedAt: serverTimestamp(),
  });

  batch.update(dirRef, {
    displayName: sanitizeDisplayName(displayName, null),
    walletName: nextWalletName,
    isFrozen: nextFrozen,
    updatedAt: serverTimestamp(),
  });

  if (auditEvent) {
    const logRef = doc(db, 'wallets', wallet.ownerUid, 'security_logs', generateId('sec'));
    batch.set(logRef, {
      ownerUid: wallet.ownerUid,
      eventType: auditEvent.eventType,
      summary: auditEvent.summary.slice(0, BLUEPRINT_LIMITS.SUMMARY_MAX),
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `wallets/${wallet.ownerUid}`);
  }
}

export async function saveContact(uid: string, walletAddress: string, nickname: string): Promise<void> {
  const normalized = walletAddress.trim().toUpperCase();
  if (!BLUEPRINT_LIMITS.ADDRESS_REGEX.test(normalized)) {
    throw new Error('Invalid wallet address format.');
  }
  const trimmedNick = nickname.trim().slice(0, BLUEPRINT_LIMITS.NICKNAME_MAX);
  if (!trimmedNick) {
    throw new Error('Contact nickname is required.');
  }

  const batch = writeBatch(db);
  const contactRef = doc(db, 'wallets', uid, 'contacts', normalized);
  batch.set(contactRef, {
    ownerUid: uid,
    walletAddress: normalized,
    nickname: trimmedNick,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `wallets/${uid}/contacts/${normalized}`);
  }
}

export async function removeContact(uid: string, contactId: string): Promise<void> {
  const path = `wallets/${uid}/contacts/${contactId}`;
  try {
    await deleteDoc(doc(db, 'wallets', uid, 'contacts', contactId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createPaymentRequest(
  wallet: WalletDoc,
  requesterName: string,
  amountCents: number,
  memo: string
): Promise<string> {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > BLUEPRINT_LIMITS.TX_MAX_CENTS) {
    throw new Error('Request amount must be between 0.01 CDC and 100,000.00 CDC.');
  }

  const reqId = generateId('req');
  const reqRef = doc(db, 'payment_requests', reqId);
  const batch = writeBatch(db);

  batch.set(reqRef, {
    reqId,
    requesterUid: wallet.ownerUid,
    requesterAddress: wallet.walletAddress,
    requesterName: sanitizeDisplayName(requesterName, null),
    amountCents,
    memo: memo.trim().slice(0, BLUEPRINT_LIMITS.MEMO_MAX),
    status: 'open',
    paidByUid: '',
    paidTxId: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return reqId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `payment_requests/${reqId}`);
  }
}

export async function cancelPaymentRequest(reqId: string): Promise<void> {
  const reqRef = doc(db, 'payment_requests', reqId);
  const batch = writeBatch(db);
  batch.update(reqRef, {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payment_requests/${reqId}`);
  }
}
