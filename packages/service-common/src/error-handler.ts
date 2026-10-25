import type { ErrorRequestHandler } from "express";
import { HttpError } from "./http.js";
import { errorCode, jsonLogger, type Logger } from "./logger.js";
import { MulterError } from "multer";

// pg exposes the constraint/detail; Prisma adapters nest the target fields under meta.
function mentionsEmail(error: object): boolean {
  try {
    return /email/i.test(JSON.stringify({ ...error, message: undefined, stack: undefined }));
  } catch {
    return false;
  }
}

export const createErrorHandler =
  (logger: Logger = jsonLogger): ErrorRequestHandler =>
  (error: unknown, _req, res, next) => {
    const respond = (status: number, message: string): void => {
      res
        .status(status)
        .type("application/json")
        .set("Cache-Control", "no-store")
        .json({ error: message, requestId: res.locals.requestId });
    };
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof HttpError) {
      if (error.retryAfter && /^\d+$/.test(String(error.retryAfter)))
        res.set("Retry-After", String(error.retryAfter));
      respond(error.status, error.message);
      return;
    }
    if (error instanceof MulterError) {
      respond(
        error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
        error.code === "LIMIT_FILE_SIZE"
          ? "File is too large"
          : "Invalid multipart upload",
      );
      return;
    }
    if (typeof error === "object" && error !== null) {
      if (
        "code" in error &&
        (error.code === "23505" || error.code === "P2002")
      ) {
        // Concurrent registrations race to the unique email index; other unique keys are generic conflicts.
        respond(
          409,
          mentionsEmail(error)
            ? "Email is already registered"
            : "Resource already exists",
        );
        return;
      }
      if (
        "code" in error &&
        ["23503", "23514", "23502", "P2003", "P2004", "P2011"].includes(
          String(error.code),
        )
      ) {
        respond(400, "Request violates a database constraint");
        return;
      }
      if (
        "code" in error &&
        [
          "53300",
          "57P01",
          "ECONNREFUSED",
          "57014",
          "P1001",
          "P1002",
          "P1008",
          "P1017",
          "P2024",
          "P2037",
        ].includes(String(error.code))
      ) {
        respond(503, "Service temporarily unavailable");
        return;
      }
      if ("type" in error && error.type === "entity.parse.failed") {
        respond(400, "Request body must be valid JSON");
        return;
      }
      if ("status" in error && error.status === 413) {
        respond(413, "Request body is too large");
        return;
      }
    }
    logger({
      level: "error",
      event: "request_error",
      requestId: String(res.locals.requestId),
      code: errorCode(error),
    });
    respond(500, "Internal server error");
  };

export const errorHandler = createErrorHandler();
