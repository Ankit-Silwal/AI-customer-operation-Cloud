import type { RequestHandler } from "express";
import type { ParsedQs } from "qs";

export type HttpHandler = RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  ParsedQs,
  { userId?: string; requestId?: string }
>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function authenticatedUserId(locals: { userId?: string }): string {
  if (!locals.userId) throw new HttpError(401, "A Bearer token is required");
  return locals.userId;
}
