import express, {
  type Express,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import multer from "multer";
import { HttpError } from "@repo/service-common/http";
import { id, email, object } from "@repo/service-common/validation";
import {
  keyDigest,
  serviceAuthorization,
  type ApiScope,
  type KeyIdentity,
} from "@repo/service-common/developer-identity";
import type { RateLimiter } from "@repo/service-common/rate-limit";
import { otpPurpose, type OtpService } from "@repo/service-common/otp";
import {
  apiJson,
  copyResponseHeaders,
  responseJson,
  upstream,
  type WebConfig,
} from "@repo/web-runtime/http";

export function setupExternalRoutes(
  app: Express,
  config: WebConfig,
  otp: OtpService | undefined,
) {
  const api = express.Router();
  const scope =
    (required: ApiScope): RequestHandler =>
    (req, res, next) => {
      const key = res.locals.key as KeyIdentity;
      if (!key.scopes.includes(required))
        throw new HttpError(403, `This API key requires ${required}`);
      const limiter = app.locals.rateLimiter as RateLimiter | undefined;
      if (required === "chat:write" && req.path === "/chat" && limiter)
        void limiter.middleware(() => [
          { policy: "developer_chat", identity: key.organizationId },
        ])(req, res, next);
      else next();
    };
  api.use(async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const authorization = req.get("authorization") ?? "";
    if (!/^Bearer hrt_live_[A-Za-z0-9_-]{43}$/.test(authorization))
      throw new HttpError(401, "A valid server-side API key is required");
    const hash = keyDigest(authorization.slice(7));
    const core = {
      ...config,
      apiUrl: (process.env.CORE_URL ?? config.apiUrl).replace(/\/$/, ""),
    };
    const key = await apiJson<KeyIdentity>(core, "/developer/authorize", {
      body: { hash },
      token: serviceAuthorization(config.secret, hash),
      timeoutMs: 3000,
    });
    if (
      !key.id ||
      !key.organizationId ||
      !key.token ||
      !Array.isArray(key.scopes)
    )
      throw new HttpError(503, "API authorization temporarily unavailable");
    res.locals.key = key;
    const limiter = app.locals.rateLimiter as RateLimiter | undefined;
    if (limiter)
      void limiter.middleware(() => [
        { policy: "developer_key", identity: key.id },
        { policy: "developer_workspace", identity: key.organizationId },
      ])(req, res, next);
    else next();
  });
  function identity(res: Response) {
    return res.locals.key as KeyIdentity;
  }
  function body(req: Request) {
    const data = object(req.body);
    if (Object.hasOwn(data, "organizationId"))
      throw new HttpError(
        400,
        "Workspace is selected by the API key; omit organizationId",
      );
    return data;
  }
  async function send(response: globalThis.Response, res: Response) {
    copyResponseHeaders(response, res);
    res.set("X-Request-ID", String(res.locals.requestId));
    if (!response.ok) {
      const data = await responseJson<{ error?: unknown }>(response);
      res
        .status(response.status === 422 ? 400 : response.status)
        .type("application/json")
        .json({
          error:
            typeof data.error === "string"
              ? data.error.slice(0, 1000)
              : "The request could not be completed",
          requestId: res.locals.requestId,
        });
    } else
      res
        .status(response.status)
        .send(Buffer.from(await response.arrayBuffer()));
  }
  async function forward(
    req: Request,
    res: Response,
    path: string,
    data?: unknown,
    method = req.method,
  ) {
    const response = await upstream(config, path, {
      req,
      token: identity(res).token,
      method,
      ...(data === undefined ? {} : { body: data }),
    });
    await send(response, res);
  }
  async function resource(
    req: Request,
    res: Response,
    kind: "documents" | "conversation",
  ) {
    const resourceId = id(req.params.id, "id");
    const value = await apiJson<{ organizationId: string }>(
      config,
      `/${kind}/${resourceId}`,
      { req, token: identity(res).token, timeoutMs: 5000 },
    );
    if (value.organizationId !== identity(res).organizationId)
      throw new HttpError(404, "Resource not found");
    return resourceId;
  }
  function pagination(req: Request, res: Response) {
    const query = new URLSearchParams({
      organizationId: identity(res).organizationId,
    });
    for (const name of ["page", "pageSize"])
      if (typeof req.query[name] === "string")
        query.set(name, req.query[name] as string);
    return query;
  }
  api.post("/chat", scope("chat:write"), async (req, res) => {
    const data = body(req);
    await forward(req, res, "/rag/chat", {
      question: data.question,
      history: data.history,
      topK: data.topK,
      organizationId: identity(res).organizationId,
    });
  });
  api.get("/documents", scope("documents:read"), async (req, res) =>
    forward(req, res, `/documents?${pagination(req, res)}`),
  );
  api.post("/documents", scope("documents:write"), async (req, res) => {
    const data = body(req);
    await forward(req, res, "/documents", {
      title: data.title,
      content: data.content,
      organizationId: identity(res).organizationId,
    });
  });
  api.post(
    "/documents/upload",
    scope("documents:write"),
    multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 1024 * 1024,
        files: 1,
        fields: 1,
        fieldSize: 1024,
        parts: 2,
      },
    }).single("file"),
    async (req, res) => {
      const data = body(req);
      if (!req.file) throw new HttpError(400, "A file is required");
      const form = new FormData();
      form.set("organizationId", identity(res).organizationId);
      form.set("title", typeof data.title === "string" ? data.title : "");
      form.set(
        "file",
        new Blob([new Uint8Array(req.file.buffer)], {
          type: req.file.mimetype,
        }),
        req.file.originalname,
      );
      let response: globalThis.Response;
      try {
        response = await fetch(`${config.apiUrl}/documents/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${identity(res).token}` },
          body: form,
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
      } catch {
        throw new HttpError(503, "Document upload temporarily unavailable");
      }
      await send(response, res);
    },
  );
  api.get("/documents/:id", scope("documents:read"), async (req, res) =>
    forward(req, res, `/documents/${await resource(req, res, "documents")}`),
  );
  api.get(
    "/documents/:id/download",
    scope("documents:read"),
    async (req, res) =>
      forward(
        req,
        res,
        `/documents/${await resource(req, res, "documents")}/download`,
      ),
  );
  api.delete("/documents/:id", scope("documents:write"), async (req, res) =>
    forward(req, res, `/documents/${await resource(req, res, "documents")}`),
  );
  api.post("/documents/:id/index", scope("documents:write"), async (req, res) =>
    forward(
      req,
      res,
      `/rag/documents/${await resource(req, res, "documents")}/index`,
      {},
    ),
  );
  api.get("/conversations", scope("chat:write"), async (req, res) =>
    forward(req, res, `/conversation?${pagination(req, res)}`),
  );
  api.post("/conversations", scope("chat:write"), async (req, res) => {
    const data = body(req);
    await forward(req, res, "/conversation", {
      organizationId: identity(res).organizationId,
      customerEmail: data.customerEmail,
      subject: data.subject,
      messages: data.messages,
    });
  });
  api.get("/conversations/:id", scope("chat:write"), async (req, res) =>
    forward(
      req,
      res,
      `/conversation/${await resource(req, res, "conversation")}`,
    ),
  );
  api.post(
    "/conversations/:id/messages",
    scope("chat:write"),
    async (req, res) => {
      const data = body(req);
      await forward(
        req,
        res,
        `/conversation/${await resource(req, res, "conversation")}/messages`,
        { expectedCount: data.expectedCount, messages: data.messages },
      );
    },
  );
  const verifyLimit: RequestHandler = (req, res, next) => {
    const limiter = app.locals.rateLimiter as RateLimiter | undefined;
    if (limiter)
      void limiter.middleware(() => [
        { policy: "otp_verify_ip", identity: limiter.address(req) },
      ])(req, res, next);
    else next();
  };
  api.post("/otp/challenges", scope("otp:write"), async (req, res) => {
    const data = body(req);
    if (!otp)
      throw new HttpError(503, "Email verification is not configured yet");
    res
      .status(202)
      .json(
        await otp.issue(
          `workspace:${identity(res).organizationId}`,
          email(data.email),
          otpPurpose(data.purpose),
        ),
      );
  });
  api.post("/otp/verify", scope("otp:write"), verifyLimit, async (req, res) => {
    const data = body(req);
    if (!otp)
      throw new HttpError(503, "Email verification is not configured yet");
    res.json(
      await otp.verify(
        `workspace:${identity(res).organizationId}`,
        email(data.email),
        otpPurpose(data.purpose),
        id(data.challengeId, "challengeId"),
        data.code,
      ),
    );
  });
  api.use((_req, _res) => {
    throw new HttpError(404, "Endpoint not found");
  });
  app.use("/v1", api);
}
