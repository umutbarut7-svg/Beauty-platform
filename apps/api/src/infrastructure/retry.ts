export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  retryable(error: unknown): boolean;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (attempt >= options.maxAttempts || !options.retryable(error))
        throw error;
      const delay = Math.min(
        options.maxDelayMs,
        options.initialDelayMs * 2 ** (attempt - 1),
      );
      await (options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(
        delay,
      );
    }
  }
}

export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
