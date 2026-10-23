import { HttpError } from "@repo/service-common/http";
import { email, id, object, text } from "@repo/service-common/validation";
import type { CreateConversationInput, Message } from "./conversation.types.js";

export function parseConversation(value: unknown): CreateConversationInput {
  const body = object(value);
  const organizationId = id(body.organizationId, "organizationId");
  const customerEmail = email(body.customerEmail, "customerEmail");
  const subject = text(body.subject, "subject");
  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length > 100) {
    throw new HttpError(
      400,
      "messages must be an array of at most 100 messages",
    );
  }
  const normalized = parseMessages(messages);
  return { organizationId, customerEmail, subject, messages: normalized };
}

export function parseMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages) || messages.length > 100) throw new HttpError(400, "messages must be an array of at most 100 messages");
  return messages.map((value: unknown) => {
    const message = object(value);
    if (message.role !== "user" && message.role !== "assistant") {
      throw new HttpError(400, "Each message role must be user or assistant");
    }
    return {
      role: message.role,
      content: text(message.content, "message content", 10000),
    };
  });
}
