// Sign-up is Gmail only, and one Gmail is one account.
//
// Google ignores dots in the local part and everything after a "+", so
// f.o.o+bonk@gmail.com and foo@gmail.com are the same inbox. Storing the
// address as typed would let one person hold a hundred accounts, so the
// canonical form is what gets written and what uniqueness is checked against.
//
// googlemail.com is the same service under an older name.

const GMAIL_DOMAINS = ["gmail.com", "googlemail.com"];

export function isGmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  return GMAIL_DOMAINS.includes(email.slice(at + 1).toLowerCase());
}

/** The canonical form of a Gmail address, or null if it is not one. */
export function normalizeGmail(email: string): string | null {
  const clean = email.trim().toLowerCase();
  if (!isGmail(clean)) return null;
  const local = clean.slice(0, clean.lastIndexOf("@"));
  const base = local.split("+")[0].replace(/\./g, "");
  if (!base) return null;
  return `${base}@gmail.com`;
}
