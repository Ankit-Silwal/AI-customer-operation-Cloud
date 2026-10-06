import { HttpError } from "./http.js";

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function text(value: unknown, field: string, maxLength = 255): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new HttpError(
      400,
      `${field} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value.trim();
}

export function email(value: unknown, field = "email"): string {
  const result = text(value, field, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new HttpError(400, `${field} must be a valid email address`);
  }
  return result;
}

export function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new HttpError(400, "password must be between 8 and 128 characters");
  }
  return value;
}

export function id(value: unknown, field = "id"): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new HttpError(400, `${field} must be a UUID`);
  }
  return value;
}
