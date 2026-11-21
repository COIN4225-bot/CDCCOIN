import { BLUEPRINT_LIMITS } from '../types/wallet';

const ALPHANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChars(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHANUM[bytes[i] % ALPHANUM.length];
  }
  return out;
}

export function generateWalletAddress(uid: string): string {
  const cleanPrefix = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  const seg1 = (cleanPrefix + randomChars(4)).slice(0, 4);
  const seg2 = randomChars(4);
  return `CDC-${seg1}-${seg2}`;
}

export function generateId(prefix: string): string {
  const raw = `${prefix}_${Date.now().toString(36)}_${randomChars(6).toLowerCase()}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export async function hashPin(pin: string, uid: string): Promise<string> {
  const payload = `${uid}:cdccoin_v1:${pin}`;
  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function formatCDC(cents: number, includeUnit = true): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  const formatted = (safe / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return includeUnit ? `${formatted} CDC` : formatted;
}

export function parseCDCToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const cents = Math.round(value * 100);
  if (cents <= 0 || cents > BLUEPRINT_LIMITS.TX_MAX_CENTS) {
    return null;
  }
  return cents;
}

export function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sanitizeDisplayName(rawName: string | null | undefined, email: string | null | undefined): string {
  const candidate = (rawName || email?.split('@')[0] || 'CDCCoin User').trim();
  const clamped = candidate.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
  return clamped.length >= BLUEPRINT_LIMITS.DISPLAY_NAME_MIN ? clamped : 'CDCCoin User';
}

export function extractFriendlyError(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'An unexpected error occurred.';
  }
  try {
    const parsed = JSON.parse(err.message) as { error?: string };
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.includes('Missing or insufficient permissions')) {
        return 'Security rules rejected this action. Verify the wallet is not frozen, daily limit is sufficient, and inputs are valid.';
      }
      return parsed.error;
    }
  } catch {
    // Plain error message
  }
  return err.message;
}
