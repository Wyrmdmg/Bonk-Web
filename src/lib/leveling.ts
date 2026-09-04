// Isomorphic leveling math shared by client + server.
// Level curve: XP needed for level N = 25 * (N-1)^2.
// L1: 0, L2: 25, L3: 100, L4: 225, L5: 400, L6: 625, ...
export function xpForLevel(level: number): number {
  return 25 * (level - 1) * (level - 1);
}
export function levelFromXp(xp: number): number {
  if (xp < 25) return 1;
  return 1 + Math.floor(Math.sqrt(xp / 25));
}
export function levelProgress(xp: number): {
  level: number;
  into: number;
  span: number;
  pct: number;
} {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = next - base;
  const into = xp - base;
  return { level, into, span, pct: Math.max(0, Math.min(1, into / span)) };
}
