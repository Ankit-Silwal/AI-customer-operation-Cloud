import multer from "multer";
import type { RequestHandler } from "express";
import { HttpError } from "../../common/http.js";

export const MAX_UPLOAD_BYTES = 1048576;
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, parts: 3, fieldSize: 1024 },
}).single("file");

export const parseUpload: RequestHandler = (req, res, next) => {
  parser(req, res, (error: unknown) => {
    if (!error || error instanceof multer.MulterError) return next(error);
    next(new HttpError(400, "Invalid multipart upload"));
  });
};

export function validateFile(file?: Express.Multer.File) {
  if (!file) throw new HttpError(400, "A file is required");
  const fileName = file.originalname;
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,199}$/.test(fileName)) {
    throw new HttpError(400, "Invalid file name");
  }
  const extension = fileName.toLowerCase().split(".").pop();
  const types: Record<string, string[]> = {
    txt: ["text/plain"], md: ["text/markdown", "text/plain"], pdf: ["application/pdf"],
  };
  if (!extension || !types[extension]?.includes(file.mimetype)) {
    throw new HttpError(415, "Only Text, Markdown and PDF files are accepted");
  }
  if (!file.size) throw new HttpError(400, "File must not be empty");
  const mediaType = extension === "pdf" ? "application/pdf" : extension === "md" ? "text/markdown" : "text/plain";
  let content = "";
  if (extension === "pdf") {
    if (file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-" ||
        !file.buffer.subarray(-1024).toString("ascii").includes("%%EOF")) {
      throw new HttpError(400, "Invalid PDF signature");
    }
  } else {
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer); }
    catch { throw new HttpError(400, "Text files must use valid UTF-8"); }
    const hasControl = Array.from(content).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    });
    if (!content.trim() || content.length > 200000 || hasControl) {
      throw new HttpError(400, "Invalid text content or content exceeds 200000 characters");
    }
  }
  return { fileName, mediaType, content, bytes: file.buffer };
}
