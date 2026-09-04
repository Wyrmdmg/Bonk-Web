// Recognized user tags - rendered next to a username as a small badge.
// Keep in sync with any server-side references. Match by lowercase username.
export type UserTag = {
  label: string;
  title: string;
  className: string;
};

const TAGS: Record<string, UserTag> = {
  ruth31: {
    label: "First User",
    title: "The very first user of Bonk",
    className: "bg-[var(--flame)] text-[var(--bone)]",
  },
};

export function getUserTag(username?: string | null): UserTag | null {
  if (!username) return null;
  return TAGS[username.toLowerCase()] ?? null;
}
