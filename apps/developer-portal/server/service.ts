import { createHmac } from "node:crypto";
import { apiJson, type WebConfig } from "@repo/web-runtime/http";
import { HttpError } from "@repo/service-common/http";
import { policyContent, policyTitle } from "./policies.js";

interface Page<T> {
  items: T[];
  total: number;
}
interface Document {
  id: string;
  title: string;
}
interface Organization {
  id: string;
  name: string;
}
interface Auth {
  token: string;
  user: { id: string };
}
export interface Source {
  documentId: string;
  title: string;
  text: string;
  score: number;
}
export interface Conversation {
  id: string;
  organizationId: string;
  customerEmail: string;
  subject: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export class DemoService {
  private auth: Auth | undefined;
  private organizationId = "";
  private pending: Promise<void> | undefined;
  private preparedAt = 0;
  state: "preparing" | "ready" | "unavailable" = "preparing";
  constructor(private readonly config: WebConfig) {}

  async prepare(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.state === "ready" && Date.now() - this.preparedAt < 6 * 86400_000)
      return;
    if (this.preparedAt && Date.now() - this.preparedAt >= 6 * 86400_000)
      this.auth = undefined;
    this.pending ??= this.initialize().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async initialize(): Promise<void> {
    this.state = "preparing";
    try {
      const email = process.env.DOCS_DEMO_EMAIL ?? "sandbox@hearth.example";
      const password =
        process.env.DOCS_DEMO_PASSWORD ||
        createHmac("sha256", this.config.secret)
          .update("hearth-docs-sandbox-v1")
          .digest("base64url");
      if (!this.auth)
        try {
          this.auth = await apiJson<Auth>(this.config, "/login", {
            body: { email, password },
          });
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 401)
            throw error;
          this.auth = await apiJson<Auth>(this.config, "/register", {
            body: { email, password, name: "Hearth sandbox demo" },
          });
        }
      const token = this.auth.token;
      const organizations = await apiJson<Page<Organization>>(
        this.config,
        "/organizations?pageSize=100",
        { token },
      );
      let organization = organizations.items.find(
        (item) => item.name === "Hearth sandbox",
      );
      organization ??= await apiJson<Organization>(
        this.config,
        "/organizations",
        { token, body: { name: "Hearth sandbox" } },
      );
      this.organizationId = organization.id;
      const documents = await apiJson<Page<Document>>(
        this.config,
        `/documents?organizationId=${organization.id}&pageSize=100`,
        { token },
      );
      let document = documents.items.find((item) => item.title === policyTitle);
      document ??= await apiJson<Document>(this.config, "/documents", {
        token,
        body: {
          organizationId: organization.id,
          title: policyTitle,
          content: policyContent,
        },
      });
      await apiJson(this.config, `/rag/documents/${document.id}/index`, {
        token,
        body: {},
      });
      this.preparedAt = Date.now();
      this.state = "ready";
    } catch (error) {
      this.state = "unavailable";
      throw error;
    }
  }
  async status() {
    if (this.state !== "ready")
      return { ready: false, mode: "preparing", company: "Hearth sandbox" };
    const rag = await apiJson<{ generationConfigured: boolean }>(
      this.config,
      "/rag/health/ready",
      { timeoutMs: 750 },
    );
    return {
      ready: true,
      mode: rag.generationConfigured ? "generation" : "retrieval",
      company: "Hearth sandbox",
    };
  }
  async chat(
    question: unknown,
    history: unknown,
    req: import("express").Request,
  ) {
    if (this.state !== "ready" || !this.auth)
      throw new HttpError(
        503,
        "The sandbox is getting ready. Try again shortly",
      );
    return apiJson(this.config, "/rag/chat", {
      req,
      token: this.auth.token,
      body: { organizationId: this.organizationId, question, history, topK: 3 },
    });
  }
}
