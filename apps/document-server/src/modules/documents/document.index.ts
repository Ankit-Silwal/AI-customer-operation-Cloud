import { HttpError } from "@repo/service-common/http";

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
      response = await fetch(
        new URL(
          `rag/documents/${encodeURIComponent(documentId)}/index`,
          origin,
        ),
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        },
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
