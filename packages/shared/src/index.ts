export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}
export interface Conversation {
  id: string;
  title: string;
  updated: number;
  messages: Message[];
}
export interface DocumentMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: number;
}
export interface Organization {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  conversationCount: number;
  documentCount: number;
}
export interface CreateOrganizationInput {
  name: string;
  description?: string;
}
export interface CreateConversationInput {
  title?: string;
}
export interface SendMessageInput {
  text: string;
}
export interface ApiErrorResponse {
  error: string;
}
