import { HttpError } from "../../common/http.js";
import type { ConversationRepository } from "./conversation.repository.js";
import type {
  Conversation,
  CreateConversationInput,
} from "./conversation.types.js";

export class ConversationService {
  constructor(private readonly repository: ConversationRepository) {}

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
