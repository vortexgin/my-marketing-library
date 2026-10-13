/** Normalized lowercase email identity shared by consent, members, and attribution. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized.length > 160) {
    return null;
  }
  return normalized;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Syntactic email check (deliverability is the provider's verdict, never ours). */
export function isValidEmail(value: unknown): boolean {
  const normalized = normalizeEmail(value);
  return normalized !== null && EMAIL_PATTERN.test(normalized);
}
