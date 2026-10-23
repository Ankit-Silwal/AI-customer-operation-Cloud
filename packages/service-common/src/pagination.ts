import { HttpError } from "./http.js";
export interface PageQuery {
  page: number;
  pageSize: number;
  search: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export function pagination(query: Record<string, unknown>): PageQuery {
  const integer = (value: unknown, fallback: number, maximum: number) => {
    if (value === undefined) return fallback;
    if (
      typeof value !== "string" ||
      !/^\d{1,6}$/.test(value) ||
      Number(value) < 1 ||
      Number(value) > maximum
    )
      throw new HttpError(400, "Invalid pagination");
    return Number(value);
  };
  if (
    query.search !== undefined &&
    (typeof query.search !== "string" || query.search.length > 100)
  )
    throw new HttpError(400, "Search must be at most 100 characters");
  return {
    page: integer(query.page, 1, 10000),
    pageSize: integer(query.pageSize, 20, 100),
    search: String(query.search ?? "").trim(),
  };
}
