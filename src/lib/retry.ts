/**
 * Retry an async operation with exponential backoff.
 *
 * Built in direct response to the original outage: the n8n prototype died on a
 * transient Google Drive "Queries per minute" quota error with no retry. Every
 * outbound call to GHL / Anthropic goes through this so a 429 or 5xx self-heals.
 */
export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  /** Decide whether a thrown error / failed response is worth retrying. */
  isRetryable?: (err: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 500;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) break;
      const delay = base * 2 ** attempt + Math.random() * base; // jittered backoff
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 500)}`);
    this.name = 'HttpError';
  }
}

function defaultIsRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status === 429 || err.status >= 500;
  }
  // Network-level errors (fetch throws TypeError) are worth retrying.
  return err instanceof TypeError;
}
