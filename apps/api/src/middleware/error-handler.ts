import type { ErrorRequestHandler } from "express";
import { HttpError } from "../common/http.js";
import { errorCode, jsonLogger, type Logger } from "../common/logger.js";
import { MulterError } from "multer";

export const createErrorHandler = (logger: Logger = jsonLogger): ErrorRequestHandler => (
  error: unknown,
  _req,
  res,
  next,
) => {
  const respond = (status: number, message: string): void => {
    res.status(status).json({ error: message, requestId: res.locals.requestId });
  };
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    respond(error.status, error.message);
    return;
  }
  if (error instanceof MulterError) {
    respond(error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
      error.code === "LIMIT_FILE_SIZE" ? "File is too large" : "Invalid multipart upload");
    return;
  }
  if (typeof error === "object" && error !== null) {
    if ("code" in error && error.code === "23505") {
      respond(409, "Email is already registered");
      return;
    }
    if ("code" in error && (error.code === "23503" || error.code === "23514" || error.code === "23502")) {
      respond(400, "Request violates a database constraint");
      return;
    }
    if ("code" in error && (error.code === "53300" || error.code === "57P01" || error.code === "ECONNREFUSED" || error.code === "57014")) {
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
  logger({ level: "error", event: "request_error", requestId: String(res.locals.requestId), code: errorCode(error) });
  respond(500, "Internal server error");
};

export const errorHandler = createErrorHandler();
