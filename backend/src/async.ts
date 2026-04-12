/**
 * Timeout and retry helpers for outbound provider calls (stubs today).
 */

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error
): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(onTimeout()), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: number; delayMs: number }
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === options.maxAttempts) break;
      await new Promise((r) => setTimeout(r, options.delayMs * attempt));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
