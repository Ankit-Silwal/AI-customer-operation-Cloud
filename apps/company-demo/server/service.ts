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
  private pending: Promise<void> | undefined;
  private preparedAt = 0;
  state: "preparing" | "ready" | "unavailable" = "preparing";
  constructor(private readonly config: WebConfig) {}

  async prepare(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.state === "ready" && Date.now() - this.preparedAt < 6 * 86400_000)
      return;
    this.pending ??= this.initialize().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async initialize(): Promise<void> {
    this.state = "preparing";
    try {
      const token = this.key();
      const documents = await apiJson<Page<Document>>(
        this.apiConfig(),
        "/documents?pageSize=100",
        { token },
      );
      let document = documents.items.find((item) => item.title === policyTitle);
      document ??= await apiJson<Document>(this.apiConfig(), "/documents", {
        token,
        body: {
          title: policyTitle,
          content: policyContent,
        },
      });
      await apiJson(this.apiConfig(), `/documents/${document.id}/index`, {
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
  private key(): string {
    const key = process.env.HEARTH_API_KEY?.trim();
    if (!key || !/^hrt_live_[A-Za-z0-9_-]{43}$/.test(key))
      throw new HttpError(
        503,
        "Set HEARTH_API_KEY in apps/company-demo/.env to connect this demo",
      );
    return key;
  }
  private apiConfig(): WebConfig {
    const url = new URL(
      process.env.HEARTH_API_BASE_URL ?? `${this.config.apiUrl}/v1`,
    );
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/\/v1\/?$/.test(url.pathname)
    )
      throw new Error(
        "HEARTH_API_BASE_URL must be an HTTP(S) URL ending in /v1",
      );
    return {
      ...this.config,
      apiUrl: `${url.origin}${url.pathname.replace(/\/$/, "")}`,
    };
  }
  async status() {
    return {
      ready: this.state === "ready",
      mode: "chat",
      company: "Oak & Ember",
      configured: Boolean(process.env.HEARTH_API_KEY?.trim()),
    };
  }
  async history(id: string | undefined): Promise<Conversation | undefined> {
    if (!id) return undefined;
    await this.prepare();
    const saved = await apiJson<Conversation>(
      this.apiConfig(),
      `/conversations/${id}`,
      { token: this.key() },
    );
    return saved;
  }
  async ask(
    question: string,
    conversationId: string | undefined,
    visitorId: string,
    req: Request,
  ) {
    if (this.state !== "ready")
      throw new HttpError(
        503,
        "Our demo assistant is getting ready. Please try again shortly",
      );
    await this.prepare();
    const previous = await this.history(conversationId);
    if (previous && previous.messages.length >= 98)
      throw new HttpError(
        400,
        "This conversation is full. Start a new chat to continue",
      );
    const token = this.key();
    const result = await apiJson<{
      answer: string;
      sources: Source[];
      mode: string;
    }>(this.apiConfig(), "/chat", {
      req,
      token,
      body: { question, history: previous?.messages.slice(-10) ?? [], topK: 3 },
    });
    const { answer, sources } = result;
    const messages = [
      { role: "user" as const, content: question },
      { role: "assistant" as const, content: answer.slice(0, 10000) },
    ];
    const saved = previous
      ? await apiJson<Conversation>(
          this.apiConfig(),
          `/conversations/${previous.id}/messages`,
          {
            token,
            body: { expectedCount: previous.messages.length, messages },
          },
        )
      : await apiJson<Conversation>(this.apiConfig(), "/conversations", {
          token,
          body: {
            customerEmail: `${visitorId}@visitor.example`,
            subject: question.slice(0, 255),
            messages,
          },
        });
    return { conversationId: saved.id, answer, sources, mode: result.mode };
  }
}
