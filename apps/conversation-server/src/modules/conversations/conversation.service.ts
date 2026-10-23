import type { PageQuery } from "@repo/service-common/pagination";
import { HttpError } from "@repo/service-common/http";
import type { ConversationRepository } from "./conversation.repository.js";
import type {
  Conversation, Message,
  CreateConversationInput,
} from "./conversation.types.js";

export class ConversationService {
  constructor(private readonly repository: ConversationRepository) {}

  append(id: string, ownerId: string, expectedCount: number, messages: Message[]) { return this.repository.append(id, ownerId, expectedCount, messages); }

  list(organizationId: string, ownerId: string, query: PageQuery) { return this.repository.list(organizationId, ownerId, query); }

  async create(
    input: CreateConversationInput,
    ownerId: string,
  ): Promise<Conversation> {
    const conversation = await this.repository.createForOwner(input, ownerId);
    if (!conversation) throw new HttpError(404, "Organization not found");
    return conversation;
  }

  async getById(id: string, ownerId: string): Promise<Conversation> {
    const conversation = await this.repository.findOwnedById(id, ownerId);
    if (!conversation) throw new HttpError(404, "Conversation not found");
    return conversation;
  }
}
