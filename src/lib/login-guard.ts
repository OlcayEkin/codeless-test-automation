import "server-only";

// In-memory lockout is enough for a single local process. Move it to the database on the server.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

export function isLocked(email: string, now = Date.now()) {
  const entry = failures.get(email);
  return !!entry && entry.lockedUntil > now;
}

export function recordFailure(email: string, now = Date.now()) {
  const entry = failures.get(email) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
    entry.count = 0;
  }
  failures.set(email, entry);
}

export function clearFailures(email: string) {
  failures.delete(email);
}
