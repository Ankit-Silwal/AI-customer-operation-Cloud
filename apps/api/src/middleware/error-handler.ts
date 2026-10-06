import type { ErrorRequestHandler } from "express";
import { HttpError } from "../common/http.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (typeof error === "object" && error !== null) {
    if ("code" in error && error.code === "23505") {
      res.status(409).json({ error: "Email is already registered" });
      return;
    }
    if ("type" in error && error.type === "entity.parse.failed") {
      res.status(400).json({ error: "Request body must be valid JSON" });
      return;
    }
    if ("status" in error && error.status === 413) {
      res.status(413).json({ error: "Request body is too large" });
      return;
    }
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};
