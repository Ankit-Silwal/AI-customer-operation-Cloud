export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Full-jitter exponential backoff; callers must only retry idempotent work.
export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  { attempts = 3, baseDelayMs = 50, maxDelayMs = 1000, shouldRetry = () => true }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      await wait(Math.random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
}

export class RetryableResponse extends Error {
  constructor(readonly response: Response) {
    super(`Retryable upstream status ${response.status}`);
  }
}

const retryableStatus = new Set([502, 503, 504]);

// Retries network failures and gateway/unavailable statuses for idempotent requests.
// Each attempt gets its own timeout so a hung replica does not consume the whole budget.
export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit & { timeoutMs?: number } = {},
  options: RetryOptions = {},
): Promise<Response> {
  const { timeoutMs = 2000, ...request } = init;
  try {
    return await retry(async () => {
      const response = await fetch(url, { ...request, signal: AbortSignal.timeout(timeoutMs) });
      if (retryableStatus.has(response.status)) {
        await response.arrayBuffer().catch(() => undefined);
        throw new RetryableResponse(response);
      }
      return response;
    }, options);
  } catch (error) {
    if (error instanceof RetryableResponse) return error.response;
    throw error;
  }
}

const transientDatabaseCodes = new Set(["40001", "40P01", "P2034"]);

// Serialization failures and deadlocks roll back the whole transaction, so rerunning it is safe.
export function isTransactionConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code) : "";
  if (transientDatabaseCodes.has(code)) return true;
  const cause = "cause" in error ? error.cause : undefined;
  return cause !== undefined && cause !== error && isTransactionConflict(cause);
}

export function retryTransaction<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  return retry(operation, { attempts, baseDelayMs: 20, maxDelayMs: 200, shouldRetry: isTransactionConflict });
}
