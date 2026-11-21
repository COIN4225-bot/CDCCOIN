/**
 * Security Rule Verification Harness for CDCCoin Wallet ("Dirty Dozen" Payloads)
 * Documents the 12 adversarial payloads tested against firestore.rules.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  targetPath: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  enforcingRule: string;
}

export const DIRTY_DOZEN_PAYLOADS: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Arbitrary Mint on Wallet Create',
    targetPath: 'wallets/attacker_uid',
    operation: 'create',
    payload: {
      ownerUid: 'attacker_uid',
      walletAddress: 'CDC-HACK-9999',
      walletName: 'Free Money',
      balanceCents: 999999900,
      dailySendLimitCents: 50000,
      dailySentTodayCents: 0,
      lastSentDate: '',
      isFrozen: false,
      requirePinForSend: false,
      pinHash: '',
      lastTxId: ''
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'incoming().balanceCents == 100000'
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Wallet Update',
    targetPath: 'wallets/attacker_uid',
    operation: 'update',
    payload: {
      walletName: 'Updated',
      isAdmin: true
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'isValidWallet(incoming(), uid) -> data.keys().hasOnly(...)'
  },
  {
    id: 3,
    name: 'Direct Balance Inflation Without Ledger Transaction',
    targetPath: 'wallets/attacker_uid',
    operation: 'update',
    payload: {
      balanceCents: 500000,
      lastTxId: 'fake_tx_id'
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'getAfter(/databases/.../transactions/$(incoming().lastTxId))'
  },
  {
    id: 4,
    name: 'Frozen Wallet Transfer Bypass',
    targetPath: 'wallets/frozen_uid',
    operation: 'update',
    payload: {
      balanceCents: 90000,
      dailySentTodayCents: 10000,
      lastSentDate: '2026-11-20',
      lastTxId: 'tx_frozen_attempt'
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: '!existing().isFrozen'
  },
  {
    id: 5,
    name: 'Daily Send Limit Bypass',
    targetPath: 'wallets/sender_uid',
    operation: 'update',
    payload: {
      balanceCents: 0,
      dailySentTodayCents: 100000,
      lastSentDate: '2026-11-20',
      lastTxId: 'tx_over_limit'
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'incoming().dailySentTodayCents <= existing().dailySendLimitCents'
  },
  {
    id: 6,
    name: 'Counterparty Theft (Negative Credit)',
    targetPath: 'wallets/victim_uid',
    operation: 'update',
    payload: {
      balanceCents: 0,
      lastTxId: 'tx_theft'
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'incoming().balanceCents == existing().balanceCents + tx.amountCents (amountCents > 0)'
  },
  {
    id: 7,
    name: 'Unbacked Transaction Forgery',
    targetPath: 'transactions/forged_tx_01',
    operation: 'create',
    payload: {
      txId: 'forged_tx_01',
      type: 'p2p_transfer',
      fromUid: 'attacker_uid',
      toUid: 'victim_uid',
      amountCents: 50000,
      status: 'completed'
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'getAfter(sender).balanceCents == get(sender).balanceCents - incoming().amountCents'
  },
  {
    id: 8,
    name: 'Self-Transfer Minting Attempt',
    targetPath: 'transactions/self_tx_01',
    operation: 'create',
    payload: {
      txId: 'self_tx_01',
      type: 'p2p_transfer',
      fromUid: 'attacker_uid',
      toUid: 'attacker_uid',
      amountCents: 10000
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'incoming().toUid != request.auth.uid'
  },
  {
    id: 9,
    name: 'Replay Attack on Existing Transaction ID',
    targetPath: 'wallets/victim_uid',
    operation: 'update',
    payload: {
      balanceCents: 150000,
      lastTxId: 'already_committed_tx'
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: '!exists(/databases/.../transactions/$(incoming().lastTxId))'
  },
  {
    id: 10,
    name: 'Immutable Ledger Tampering',
    targetPath: 'transactions/tx_12345',
    operation: 'delete',
    payload: {},
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'allow update, delete: if false;'
  },
  {
    id: 11,
    name: 'Directory Scraping / PII Enumeration',
    targetPath: 'wallet_directory',
    operation: 'list',
    payload: {},
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'allow list: if false;'
  },
  {
    id: 12,
    name: 'Payment Request Fulfillment Spoofing',
    targetPath: 'payment_requests/req_123',
    operation: 'update',
    payload: {
      status: 'paid',
      paidByUid: 'attacker_uid',
      paidTxId: 'nonexistent_tx'
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcingRule: 'getAfter(.../transactions/$(incoming().paidTxId)).data.amountCents == existing().amountCents'
  }
];
