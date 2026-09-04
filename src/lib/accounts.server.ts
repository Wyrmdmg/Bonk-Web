// Server-only helpers. Never import from client-reachable modules at module scope.
import bcrypt from "bcryptjs";

export const SYNTHETIC_EMAIL_DOMAIN = "wyrmdmg.local";

export function toSyntheticEmail(username: string) {
  return `${username.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export async function hashSecret(value: string) {
  return bcrypt.hash(value, 10);
}
export async function verifySecret(value: string, hash: string) {
  return bcrypt.compare(value, hash);
}

export function generateRecoveryCode() {
  // 4 groups of 4 uppercase alphanumeric
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = "";
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    for (const b of buf) s += alphabet[b % alphabet.length];
    groups.push(s);
  }
  return groups.join("-");
}

// Simple leetspeak normalization + substring blocklist check.
export function normalizeForFilter(input: string) {
  return input
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]/g, "");
}

export function containsBlockedWord(input: string, blockedWords: string[]) {
  const normalized = normalizeForFilter(input);
  return blockedWords.some((w) => normalized.includes(w));
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_RE = /^[\p{L}\p{N} _.-]{2,24}$/u;
