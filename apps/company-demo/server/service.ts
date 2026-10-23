import { createHmac } from "node:crypto";
import type { Request } from "express";
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
      const email = process.env.DEMO_OWNER_EMAIL ?? "care@oakandember.example";
      const password =
        process.env.DEMO_OWNER_PASSWORD ||
        createHmac("sha256", this.config.secret)
          .update("oak-and-ember-demo-account-v1")
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
            body: { email, password, name: "Oak & Ember demo" },
          });
        }
      const token = this.auth.token;
      const organizations = await apiJson<Page<Organization>>(
        this.config,
        "/organizations?pageSize=100",
        { token },
      );
      let organization = organizations.items.find(
        (item) => item.name === "Oak & Ember",
      );
      organization ??= await apiJson<Organization>(
        this.config,
        "/organizations",
        { token, body: { name: "Oak & Ember" } },
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
      return { ready: false, mode: "preparing", company: "Oak & Ember" };
    const rag = await apiJson<{ generationConfigured: boolean }>(
      this.config,
      "/rag/health/ready",
      { timeoutMs: 750 },
    );
    return {
      ready: true,
      mode: rag.generationConfigured ? "generation" : "retrieval",
      company: "Oak & Ember",
    };
  }
  async history(id: string | undefined): Promise<Conversation | undefined> {
    if (!id || !this.auth) return undefined;
    const saved = await apiJson<Conversation>(
      this.config,
      `/conversation/${id}`,
      { token: this.auth.token },
    );
    if (saved.organizationId !== this.organizationId)
      throw new HttpError(404, "Conversation not found");
    return saved;
  }
  async ask(
    question: string,
    conversationId: string | undefined,
    visitorId: string,
    req: Request,
  ) {
    if (this.state !== "ready" || !this.auth)
      throw new HttpError(
        503,
        "Our demo assistant is getting ready. Please try again shortly",
      );
    const previous = await this.history(conversationId);
    if (previous && previous.messages.length >= 98)
      throw new HttpError(
        400,
        "This conversation is full. Start a new chat to continue",
      );
    const token = this.auth.token;
    const status = await this.status();
    let answer: string;
    let sources: Source[];
    if (status.mode === "generation") {
      const result = await apiJson<{ answer: string; sources: Source[] }>(
        this.config,
        "/rag/query",
        {
          req,
          token,
          body: { organizationId: this.organizationId, question, topK: 3 },
        },
      );
      answer = result.answer;
      sources = result.sources;
    } else {
      const result = await apiJson<{ sources: Source[] }>(
        this.config,
        "/rag/search",
        {
          req,
          token,
          body: { organizationId: this.organizationId, question, topK: 2 },
        },
      );
      sources = result.sources.filter((source) => source.score >= 0.35);
      answer = sources.length
        ? `Here’s the relevant passage from our customer care handbook:\n\n${sources[0]!.text}`
        : "I couldn’t find a clear answer in our policies. Please email care@oakandember.example and our team will help.";
    }
    const messages = [
      { role: "user" as const, content: question },
      { role: "assistant" as const, content: answer.slice(0, 10000) },
    ];
    const saved = previous
      ? await apiJson<Conversation>(
          this.config,
          `/conversation/${previous.id}/messages`,
          {
            token,
            body: { expectedCount: previous.messages.length, messages },
          },
        )
      : await apiJson<Conversation>(this.config, "/conversation", {
          token,
          body: {
            organizationId: this.organizationId,
            customerEmail: `${visitorId}@visitor.example`,
            subject: question.slice(0, 255),
            messages,
          },
        });
    return { conversationId: saved.id, answer, sources, mode: status.mode };
  }
}
