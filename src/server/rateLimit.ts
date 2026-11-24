import { AppError } from './services/errors.ts';

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

export function assertWithinRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  errorMessage: string,
): void {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry) return;
  if (now >= entry.resetAt) {
    buckets.delete(key);
    return;
  }
  if (entry.count >= maxAttempts) {
    throw new AppError(429, errorMessage);
  }
}

export function recordRateLimitHit(key: string, windowMs: number): void {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
