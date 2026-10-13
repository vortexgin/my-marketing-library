/**
 * Best-effort in-memory sliding-window rate limiter for public endpoints
 * (form submit, unsubscribe, tracked redirect). Per-process state: in
 * multi-instance deployments each instance enforces its own window, so
 * treat limits as abuse friction, not a security boundary. A shared
 * (Redis/DB) limiter is the production hardening path.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export function checkRateLimit(key: string, maxHits: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now >= current.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (current.count >= maxHits) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }
  current.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/** Client IP for rate-limit keys (trusts the platform forwarding header). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "unknown";
  }
  return "unknown";
}
