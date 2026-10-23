export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter = 0,
    readonly requestId = "",
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      "We couldn’t reach the service. Check your connection and try again.",
      0,
    );
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("hearth-session-expired"));
    throw new ApiError(
      data.error ?? "Something went wrong. Please try again.",
      response.status,
      Number(response.headers.get("retry-after") ?? 0),
      data.requestId ?? "",
    );
  }
  return data as T;
}
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}
export interface Message {
  role: "user" | "assistant";
  content: string;
}
export interface Conversation {
  id: string;
  organizationId: string;
  customerEmail: string;
  subject: string;
  messages: Message[];
  createdAt: string;
}
export interface Document {
  id: string;
  organizationId: string;
  title: string;
  content?: string;
  createdAt: string;
  upload?: { fileName: string; mediaType: string; byteLength: number } | null;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Source {
  documentId: string;
  title: string;
  text: string;
  score: number;
  chunkIndex: number;
}
export interface ServiceStatus {
  status: string;
  generationConfigured: boolean;
}
