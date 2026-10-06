import { HttpError } from "../../common/http.js";
import { email, id, object, text } from "../../common/validation.js";
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
  const normalized: Message[] = messages.map((value: unknown) => {
    const message = object(value);
    if (message.role !== "user" && message.role !== "assistant") {
      throw new HttpError(400, "Each message role must be user or assistant");
    }
    return {
      role: message.role,
      content: text(message.content, "message content", 10000),
    };
  });
  return { organizationId, customerEmail, subject, messages: normalized };
}
