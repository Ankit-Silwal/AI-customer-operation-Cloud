import { HttpError } from "@repo/service-common/http";
import { fetchWithRetry } from "@repo/service-common/retry";

export type RemoveDocumentIndex = (
  documentId: string,
  token: string,
) => Promise<void>;

export class IndexCleanupError extends HttpError {
  constructor(
    status: number,
    message: string,
    readonly retryAfter = 1,
  ) {
    super(status, message);
  }
}

export function createIndexRemoval(baseUrl: string): RemoveDocumentIndex {
  const origin = new URL(`${baseUrl.replace(/\/+$/, "")}/`);
  return async (documentId, token) => {
    let response: Response;
    try {
      // Vector removal is an idempotent filtered delete, so transient failures are retried.
      response = await fetchWithRetry(
        new URL(
          `rag/documents/${encodeURIComponent(documentId)}/index`,
          origin,
        ),
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 10000,
          redirect: "error",
        },
        { attempts: 2, baseDelayMs: 200 },
      );
      await response.arrayBuffer();
    } catch {
      throw new IndexCleanupError(
        503,
        "Source cleanup is temporarily unavailable. Your document was kept; please retry",
      );
    }
    if (response.status === 429)
      throw new IndexCleanupError(
        429,
        "Knowledge processing is busy. Your document was kept; please retry shortly",
        Math.max(
          1,
          Math.min(86400, Number(response.headers.get("retry-after")) || 1),
        ),
      );
    if (!response.ok)
      throw new IndexCleanupError(
        503,
        "Source cleanup could not finish. Your document was kept; please retry",
      );
  };
}
