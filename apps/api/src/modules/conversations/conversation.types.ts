export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CreateConversationInput {
  organizationId: string;
  customerEmail: string;
  subject: string;
  messages: Message[];
}

export interface Conversation extends CreateConversationInput {
  id: string;
  createdAt: Date;
}
