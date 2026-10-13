import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Opaque signed public tokens (unsubscribe, tracked-link bearer, visitor
 * identifier). Format: base64url(payload) + "." + base64url(signature),
 * where signature = HMAC-SHA256(secret, payload). Payloads carry purpose +
 * expiry so tokens fail safely without revealing whether an address exists.
 */

function tokenSecret(): string {
  const secret = process.env.MARKETING_PUBLIC_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error("MARKETING_PUBLIC_TOKEN_SECRET is not configured.");
  }
  return secret;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signToken(payload: Record<string, unknown>): string {
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", tokenSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken<T = Record<string, unknown>>(token: string, purpose: string, maxAgeMs?: number): T | null {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) {
      return null;
    }
    const expected = createHmac("sha256", tokenSecret()).update(body).digest();
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }
    const payload = JSON.parse(decode(body)) as Record<string, unknown> & { purpose?: string; exp?: number };
    if (payload.purpose !== purpose) {
      return null;
    }
    if (typeof maxAgeMs === "number" && typeof payload.exp === "number" && Date.now() > payload.exp) {
      return null;
    }
    return payload as T;
  } catch {
    return null;
  }
}

/** Unsigned random bearer for tracked-link lookup (only the hash is stored). */
export function newBearerToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashBearerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Signed first-party visitor identifier cookie value. */
export function newVisitorId(): string {
  return signToken({ purpose: "visitor", id: randomBytes(16).toString("base64url"), exp: Date.now() + 365 * 24 * 3600 * 1000 });
}

export function readVisitorId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const payload = verifyToken<{ purpose?: string; id?: string }>(value, "visitor");
  return typeof payload?.id === "string" ? payload.id : null;
}
