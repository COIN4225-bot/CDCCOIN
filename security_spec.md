# CDCCoin Wallet — Security Specification & Red-Team Threat Model

## 1. Data Invariants
1. **Owner-Only Private Vault**: Only `request.auth.uid == uid` can read (`get`) `wallets/{uid}` or list/modify its `contacts` and `security_logs` subcollections. No blanket `list` on `wallets` or `wallet_directory`.
2. **PII Isolation**: `wallet_directory/{walletAddress}` exposes only `walletAddress`, `ownerUid`, `displayName`, `walletName`, `isFrozen`, `createdAt`, `updatedAt`. Email, phone, balance, and PIN hash are never stored in `wallet_directory`.
3. **Strict Initial Minting**: On wallet creation (`wallets/{uid}`), initial `balance` MUST equal `1000`, `isFrozen` MUST be `false`, `dailySentToday` MUST be `0`, and timestamps MUST match `request.time`.
4. **Atomic Conservation of Coins (P2P Transfers)**: A sender (`fromUid`) can only credit a receiver's (`toUid`) wallet inside an atomic batch that simultaneously creates an immutable `transactions/{txId}` record, debits `fromUid` by `tx.amount`, and credits `toUid` by `tx.amount`. Neither wallet can be frozen (`!existing().isFrozen`).
5. **Immutable Ledger & Audit Trail**: `transactions/{txId}` and `wallets/{uid}/security_logs/{logId}` reject all `update` and `delete` operations.
6. **Verified Identity**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
7. **Terminal State Locking**: Once a `payment_requests/{reqId}` document transitions from `'open'` to `'paid'` or `'cancelled'`, no further updates are permitted. Marking `'paid'` requires an atomic `transactions/{paidTxId}` document in the same batch matching `fromUid`, `toUid`, and `amount`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Arbitrary Mint on Create**: Creating `wallets/attacker` with `balance: 99999999` instead of `1000`.
2. **Shadow Field Injection on Wallet Update**: Updating `wallets/attacker` with `affectedKeys` plus extra field `isAdmin: true`.
3. **Direct Balance Inflation**: Updating `wallets/attacker` `balance` directly without a matching `faucet_grant` or `p2p_transfer` transaction.
4. **Frozen Wallet Bypass**: Attempting a P2P debit or credit when `existing().isFrozen == true`.
5. **Daily Limit Bypass**: Debiting an amount that pushes `dailySentToday` above `existing().dailySendLimit`.
6. **Counterparty Theft (Negative Credit)**: Sender attempting to update receiver's `wallets/{victim}` with a reduced balance.
7. **Transaction Forgery (Unbacked Ledger Entry)**: Creating `transactions/{txId}` directly without debiting `wallets/{fromUid}` in the same batch.
8. **Self-Transfer Minting**: Creating `transactions/{txId}` where `fromUid == toUid`.
9. **Replay Attack on `lastTxId`**: Reusing an already existing `txId` to trigger a second credit on `wallets/{victim}`.
10. **Ledger Tampering**: Attempting `update` or `delete` on an existing `transactions/{txId}` or `security_logs/{logId}`.
11. **Directory Scraping / PII Leak**: Attempting `list` on `wallet_directory` or `wallets` to enumerate all users.
12. **Payment Request Spoofing**: Marking `payment_requests/{reqId}` as `status: 'paid'` without creating a matching `transactions/{paidTxId}` of the exact requested amount.
