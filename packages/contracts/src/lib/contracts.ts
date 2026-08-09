export const CHARACTER_QUESTION_COUNT = 15;
export const DEFAULT_RECENT_MESSAGE_LIMIT = 10;
export const DEFAULT_MEMORY_FACT_LIMIT = 8;
export const DEFAULT_RAG_RESULT_LIMIT = 4;
export const DEFAULT_SUMMARY_MESSAGE_INTERVAL = 6;

export type ChatRole = 'system' | 'user' | 'assistant';
export type CharacterKind = 'friend' | 'teacher';
export type RagDocumentKind = 'character-lore' | 'faq' | 'journal' | 'note' | 'web';

export interface CharacterQuestionAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface CharacterProfile {
  id: string;
  userId: string;
  kind: CharacterKind;
  name: string;
  description: string;
  systemPrompt: string;
  answers: CharacterQuestionAnswer[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  userId: string;
  characterId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatMessageRecord {
  id: string;
  userId: string;
  conversationId: string;
  characterId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ConversationSummaryRecord {
  conversationId: string;
  userId: string;
  characterId: string;
  summary: string;
  updatedAt: string;
  coveredMessageCount: number;
}

export interface MemoryFactRecord {
  id: string;
  userId: string;
  characterId: string;
  conversationId: string;
  fact: string;
  confidence: number;
  sourceMessageIds: string[];
  updatedAt: string;
}

export interface RagChunk {
  id: string;
  order: number;
  text: string;
  keywords: string[];
}

export interface RagDocumentRecord {
  id: string;
  userId: string;
  characterId?: string;
  title: string;
  kind: RagDocumentKind;
  content: string;
  keywords: string[];
  chunks: RagChunk[];
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface RagSearchHit {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  text: string;
  keywords: string[];
  score: number;
}

export interface RagSearchQuery {
  userId: string;
  characterId?: string;
  query: string;
  limit: number;
}

export interface PromptPackage {
  systemInstruction: string;
  recentMessages: ChatMessageRecord[];
  memorySummary?: ConversationSummaryRecord;
  memoryFacts: MemoryFactRecord[];
  ragContext: RagSearchHit[];
  userMessage: ChatMessageRecord;
  assembledPrompt: string;
}

export interface AgentWorkflowResult {
  conversation: ConversationRecord;
  promptPackage: PromptPackage;
  userMessage: ChatMessageRecord;
  assistantMessage: ChatMessageRecord;
  summaryUpdated: boolean;
  teachingNotes: string[];
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export interface CreateCharacterInput {
  userId: string;
  kind: CharacterKind;
  name: string;
  description: string;
  answers: CharacterQuestionAnswer[];
}

export interface ChatTurnInput {
  userId: string;
  characterId: string;
  conversationId?: string;
  message: string;
}

export interface RagDocumentInput {
  userId: string;
  characterId?: string;
  title: string;
  kind: RagDocumentKind;
  content: string;
  metadata?: Record<string, string>;
}

export interface AgentWorkflowOptions {
  recentMessageLimit?: number;
  memoryFactLimit?: number;
  ragResultLimit?: number;
  summaryMessageInterval?: number;
  replyGenerator?: (input: {
    character: CharacterProfile;
    promptPackage: PromptPackage;
  }) => Promise<string>;
}

export interface AgentRepository {
  saveUser(user: UserRecord): Promise<UserRecord>;
  getUser(userId: string): Promise<UserRecord | null>;
  saveCharacter(character: CharacterProfile): Promise<CharacterProfile>;
  getCharacter(userId: string, characterId: string): Promise<CharacterProfile | null>;
  listCharacters(userId: string, kind?: CharacterKind): Promise<CharacterProfile[]>;
  saveConversation(conversation: ConversationRecord): Promise<ConversationRecord>;
  getConversation(userId: string, conversationId: string): Promise<ConversationRecord | null>;
  appendMessage(message: ChatMessageRecord): Promise<ChatMessageRecord>;
  listRecentMessages(
    userId: string,
    conversationId: string,
    limit: number
  ): Promise<ChatMessageRecord[]>;
  getSummary(userId: string, conversationId: string): Promise<ConversationSummaryRecord | null>;
  saveSummary(summary: ConversationSummaryRecord): Promise<ConversationSummaryRecord>;
  listMemoryFacts(
    userId: string,
    characterId: string,
    limit: number
  ): Promise<MemoryFactRecord[]>;
  saveMemoryFacts(facts: MemoryFactRecord[]): Promise<MemoryFactRecord[]>;
  saveRagDocument(document: RagDocumentRecord): Promise<RagDocumentRecord>;
  searchRagChunks(query: RagSearchQuery): Promise<RagSearchHit[]>;
}

export function normalizeSearchTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((term) => term.length > 2)
    )
  );
}
