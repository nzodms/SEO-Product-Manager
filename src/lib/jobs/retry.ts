// Retry with exponential backoff for transient AI/Shopify API failures.

export function isRetryableError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("throttl") || // Shopify THROTTLED
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable")
  );
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 2000;
  const max = opts.maxDelayMs ?? 30000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryableError(err)) throw err;
      // Exponential backoff with jitter: 2s, 4s, 8s, ... capped at max.
      const delay = Math.min(max, base * 2 ** attempt) + Math.floor(Math.random() * 500);
      opts.onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
    }
  }
  throw lastErr;
}
