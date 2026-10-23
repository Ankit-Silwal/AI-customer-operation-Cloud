import { closeOtpServices } from "@repo/service-common/otp";
import { randomUUID } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import express from "express";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { closeRateLimiters } from "@repo/service-common/rate-limit";
import { signedAddressHeaders } from "@repo/service-common/client-address";
import { HttpError } from "@repo/service-common/http";

export interface WebConfig {
  apiUrl: string;
  secret: string;
  origin: string;
  secure: boolean;
  port: number;
}
export function webConfig(company = false): WebConfig {
  const port = Number(
    process.env[company ? "DEMO_PORT" : "WEB_PORT"] ?? (company ? 3035 : 3030),
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid web port");
  const secret = process.env.JWT_SECRET ?? "";
  if (secret.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  const origin = new URL(
    process.env[company ? "DEMO_ORIGIN" : "WEB_ORIGIN"] ??
      `http://localhost:${port}`,
  ).origin;
  const apiUrl = new URL(process.env.API_URL ?? "http://localhost:3001").origin;
  if (![origin, apiUrl].every((value) => /^https?:\/\//.test(value)))
    throw new Error("Web URLs must use HTTP or HTTPS");
  return {
    apiUrl,
    secret,
    origin,
    secure:
      process.env.WEB_COOKIE_SECURE === "true" || origin.startsWith("https:"),
    port,
  };
}

export function csrf(origin: string): RequestHandler {
  return (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== origin
    ) {
      res.status(403).json({
        error: "Open this form from the application website",
        requestId: res.locals.requestId,
      });
      return;
    }
    next();
  };
}

export function cookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie
    ?.split(";")
    .find((item) => item.trim().startsWith(`${name}=`))
    ?.trim()
    .slice(name.length + 1);
  if (!raw || raw.length > 8192) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}
export function setCookie(
  res: Response,
  name: string,
  value: string,
  secure: boolean,
  maxAge = 7 * 86400_000,
): void {
  res.cookie(name, value, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export async function upstream(
  config: WebConfig,
  path: string,
  options: {
    req?: Request;
    requestId?: string;
    token?: string;
    method?: string;
    body?: unknown;
    contentType?: string;
    timeoutMs?: number;
  } = {},
): Promise<globalThis.Response> {
  const requestId = options.requestId ?? randomUUID();
  const headers: Record<string, string> = { "X-Request-ID": requestId };
  if (options.req)
    Object.assign(
      headers,
      signedAddressHeaders(
        options.req,
        requestId,
        config.secret,
        "rate-frontend-v1",
      ),
    );
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: string | Buffer | undefined;
  if (options.body !== undefined) {
    body = Buffer.isBuffer(options.body)
      ? options.body
      : JSON.stringify(options.body);
    headers["Content-Type"] = options.contentType ?? "application/json";
  }
  try {
    return await fetch(`${config.apiUrl}${path}`, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers,
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : new Uint8Array(body) }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 65000),
      redirect: "error",
    });
  } catch {
    throw new HttpError(
      503,
      "The service is temporarily unavailable. Please try again",
    );
  }
}
export function copyResponseHeaders(
  response: globalThis.Response,
  res: Response,
): void {
  for (const key of [
    "content-type",
    "content-disposition",
    "retry-after",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
    "ratelimit-policy",
    "x-request-id",
  ]) {
    const value = response.headers.get(key);
    if (value) res.setHeader(key, value);
  }
}
export async function apiJson<T>(
  config: WebConfig,
  path: string,
  options: Parameters<typeof upstream>[2] = {},
): Promise<T> {
  const response = await upstream(config, path, options);
  const data = await responseJson<{ error?: string }>(response);
  if (!response.ok)
    throw new ApiFailure(
      response.status,
      data.error ?? "The request could not be completed",
      response.headers.get("retry-after"),
    );
  return data as T;
}
export async function responseJson<T>(
  response: globalThis.Response,
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new HttpError(
      503,
      "The service returned an invalid response. Please try again",
    );
  }
}
export class ApiFailure extends HttpError {
  constructor(
    status: number,
    message: string,
    retryAfter: string | null = null,
  ) {
    super(status, message, retryAfter ?? undefined);
  }
}

export async function startWeb(
  app: Express,
  root: string,
  port: number,
): Promise<void> {
  const server = createServer(app);
  let closePreview: (() => Promise<void>) | undefined;
  if (process.env.NODE_ENV === "production") {
    app.use(
      express.static(resolve(root, "dist/client"), {
        index: false,
        maxAge: "1h",
      }),
    );
    app.get("/{*path}", (_req, res) =>
      res
        .set("Cache-Control", "no-cache")
        .sendFile(resolve(root, "dist/client/index.html")),
    );
  } else {
    app.use((_req, res, next) => {
      res.removeHeader("Content-Security-Policy");
      next();
    });
    const { createServer: viteServer } = await import("vite");
    const vite = await viteServer({
      root,
      server: {
        middlewareMode: true,
        hmr: { server },
        allowedHosts: ["localhost", "127.0.0.1"],
      },
      appType: "custom",
    });
    closePreview = () => vite.close();
    app.use(vite.middlewares);
    app.get("/{*path}", async (req, res) => {
      const html = await vite.transformIndexHtml(
        req.originalUrl,
        await readFile(resolve(root, "index.html"), "utf8"),
      );
      res.type("html").send(html);
    });
  }
  server.headersTimeout = 10000;
  server.requestTimeout = 70000;
  server.listen(port, "0.0.0.0", () =>
    console.log(JSON.stringify({ event: "web_started", port })),
  );
  let draining = false;
  function shutdown() {
    if (draining) return;
    draining = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(() => {
      void closePreview?.().finally(() => {
        closeRateLimiters(); closeOtpServices();
        clearTimeout(deadline);
      });
      if (!closePreview) {
        closeRateLimiters(); closeOtpServices();
        clearTimeout(deadline);
      }
    });
  }
  server.on("error", () => {
    closeRateLimiters(); closeOtpServices();
    process.exitCode = 1;
  });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
