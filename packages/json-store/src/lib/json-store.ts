import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import type {
  AgentRepository,
  CharacterProfile,
  ChatMessageRecord,
  ConversationRecord,
  ConversationSummaryRecord,
  MemoryFactRecord,
  RagDocumentRecord,
  RagSearchHit,
  RagSearchQuery,
  UserRecord,
} from '@friend-workspace/contracts';
import { normalizeSearchTerms } from '@friend-workspace/contracts';

interface MessageIndexEntry {
  id: string;
  role: ChatMessageRecord['role'];
  createdAt: string;
  path: string;
}

interface MessageIndexRecord {
  messages: MessageIndexEntry[];
}

interface RagIndexChunkEntry {
  documentId: string;
  documentTitle: string;
  characterId?: string;
  chunkId: string;
  text: string;
  keywords: string[];
}

interface RagIndexRecord {
  chunks: RagIndexChunkEntry[];
}

export class JsonFileRepository implements AgentRepository {
  constructor(private readonly rootDir: string) {}

  async saveUser(user: UserRecord): Promise<UserRecord> {
    await this.writeJson(this.userPath(user.id), user);
    return user;
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    return this.readJsonOrNull(this.userPath(userId));
  }

  async saveCharacter(character: CharacterProfile): Promise<CharacterProfile> {
    await this.writeJson(this.characterPath(character.userId, character.id), character);
    return character;
  }

  async getCharacter(userId: string, characterId: string): Promise<CharacterProfile | null> {
    return this.readJsonOrNull(this.characterPath(userId, characterId));
  }

  async listCharacters(userId: string, kind?: CharacterProfile['kind']): Promise<CharacterProfile[]> {
    try {
      const entries = await readdir(this.charactersRoot(userId), { withFileTypes: true });
      const characters = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => this.readJsonOrNull<CharacterProfile>(join(this.charactersRoot(userId), entry.name)))
      );

      return characters
        .filter(
          (character): character is CharacterProfile =>
            character !== null && (kind === undefined || character.kind === kind)
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name));
    } catch (error) {
      if (isMissingFile(error)) {
        return [];
      }

      throw error;
    }
  }

  async saveConversation(conversation: ConversationRecord): Promise<ConversationRecord> {
    await this.writeJson(this.conversationPath(conversation.userId, conversation.id), conversation);
    return conversation;
  }

  async getConversation(userId: string, conversationId: string): Promise<ConversationRecord | null> {
    return this.readJsonOrNull(this.conversationPath(userId, conversationId));
  }

  async appendMessage(message: ChatMessageRecord): Promise<ChatMessageRecord> {
    const conversationRoot = this.conversationRoot(message.userId, message.conversationId);
    const timestamp = new Date(message.createdAt);
    const dateSegment = timestamp.toISOString().slice(0, 10);
    const timeSegment = timestamp
      .toISOString()
      .slice(11, 23)
      .replace(/:/g, '-')
      .replace('.', '-');
    const filename = `chat-${timeSegment}-${message.id}.json`;
    const messagePath = join(conversationRoot, 'messages', dateSegment, filename);

    await this.writeJson(messagePath, message);

    const messageIndex = await this.readJson<MessageIndexRecord>(this.messageIndexPath(message.userId, message.conversationId), {
      messages: [],
    });

    messageIndex.messages.push({
      id: message.id,
      role: message.role,
      createdAt: message.createdAt,
      path: relative(conversationRoot, messagePath),
    });

    messageIndex.messages.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    await this.writeJson(this.messageIndexPath(message.userId, message.conversationId), messageIndex);

    const conversation =
      (await this.getConversation(message.userId, message.conversationId)) ?? {
        id: message.conversationId,
        userId: message.userId,
        characterId: message.characterId,
        createdAt: message.createdAt,
        updatedAt: message.createdAt,
        messageCount: 0,
      };

    conversation.updatedAt = message.createdAt;
    conversation.messageCount += 1;
    await this.saveConversation(conversation);

    return message;
  }

  async listRecentMessages(
    userId: string,
    conversationId: string,
    limit: number
  ): Promise<ChatMessageRecord[]> {
    const conversationRoot = this.conversationRoot(userId, conversationId);
    const messageIndex = await this.readJson<MessageIndexRecord>(this.messageIndexPath(userId, conversationId), {
      messages: [],
    });

    const selectedEntries = messageIndex.messages.slice(-limit);
    const records = await Promise.all(
      selectedEntries.map((entry) =>
        this.readJsonOrNull<ChatMessageRecord>(join(conversationRoot, entry.path))
      )
    );

    return records.filter((record): record is ChatMessageRecord => record !== null);
  }

  async getSummary(userId: string, conversationId: string): Promise<ConversationSummaryRecord | null> {
    return this.readJsonOrNull(this.summaryPath(userId, conversationId));
  }

  async saveSummary(summary: ConversationSummaryRecord): Promise<ConversationSummaryRecord> {
    await this.writeJson(this.summaryPath(summary.userId, summary.conversationId), summary);
    return summary;
  }

  async listMemoryFacts(userId: string, characterId: string, limit: number): Promise<MemoryFactRecord[]> {
    const facts = await this.readJson<MemoryFactRecord[]>(this.memoryFactsPath(userId, characterId), []);
    return facts
      .sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, limit);
  }

  async saveMemoryFacts(facts: MemoryFactRecord[]): Promise<MemoryFactRecord[]> {
    if (facts.length === 0) {
      return [];
    }

    const firstFact = facts[0];
    if (!firstFact) {
      return [];
    }

    const { userId, characterId } = firstFact;
    const mismatchedFact = facts.find(
      (fact) => fact.userId !== userId || fact.characterId !== characterId
    );

    if (mismatchedFact) {
      throw new Error('Memory facts must belong to the same user and character.');
    }

    const storedFacts = await this.readJson<MemoryFactRecord[]>(this.memoryFactsPath(userId, characterId), []);
    const keyedFacts = new Map(storedFacts.map((fact) => [fact.fact.toLowerCase(), fact]));

    for (const fact of facts) {
      const existing = keyedFacts.get(fact.fact.toLowerCase());

      if (existing) {
        keyedFacts.set(fact.fact.toLowerCase(), {
          ...existing,
          confidence: Math.max(existing.confidence, fact.confidence),
          sourceMessageIds: Array.from(new Set([...existing.sourceMessageIds, ...fact.sourceMessageIds])),
          updatedAt: fact.updatedAt,
        });
      } else {
        keyedFacts.set(fact.fact.toLowerCase(), fact);
      }
    }

    const mergedFacts = Array.from(keyedFacts.values());
    await this.writeJson(this.memoryFactsPath(userId, characterId), mergedFacts);

    return mergedFacts;
  }

  async saveRagDocument(document: RagDocumentRecord): Promise<RagDocumentRecord> {
    await this.writeJson(this.ragDocumentPath(document.userId, document.id), document);

    const ragIndex = await this.readJson<RagIndexRecord>(this.ragIndexPath(document.userId), { chunks: [] });
    const filteredChunks = ragIndex.chunks.filter((chunk) => chunk.documentId !== document.id);

    const indexedChunks = document.chunks.map((chunk) => ({
      documentId: document.id,
      documentTitle: document.title,
      characterId: document.characterId,
      chunkId: chunk.id,
      text: chunk.text,
      keywords: chunk.keywords,
    }));

    await this.writeJson(this.ragIndexPath(document.userId), {
      chunks: [...filteredChunks, ...indexedChunks],
    });

    return document;
  }

  async searchRagChunks(query: RagSearchQuery): Promise<RagSearchHit[]> {
    const searchTerms = normalizeSearchTerms(query.query);
    const ragIndex = await this.readJson<RagIndexRecord>(this.ragIndexPath(query.userId), { chunks: [] });

    return ragIndex.chunks
      .filter(
        (chunk) =>
          (!chunk.characterId || chunk.characterId === query.characterId) &&
          searchTerms.some((term) => chunk.keywords.includes(term))
      )
      .map((chunk) => ({
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        chunkId: chunk.chunkId,
        text: chunk.text,
        keywords: chunk.keywords,
        score: searchTerms.filter((term) => chunk.keywords.includes(term)).length,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, query.limit);
  }

  private userPath(userId: string): string {
    return join(this.userRoot(userId), 'user.json');
  }

  private characterPath(userId: string, characterId: string): string {
    return join(this.charactersRoot(userId), `${sanitizeSegment(characterId)}.json`);
  }

  private charactersRoot(userId: string): string {
    return join(this.userRoot(userId), 'characters');
  }

  private conversationRoot(userId: string, conversationId: string): string {
    return join(this.userRoot(userId), 'conversations', sanitizeSegment(conversationId));
  }

  private conversationPath(userId: string, conversationId: string): string {
    return join(this.conversationRoot(userId, conversationId), 'conversation.json');
  }

  private messageIndexPath(userId: string, conversationId: string): string {
    return join(this.conversationRoot(userId, conversationId), 'message-index.json');
  }

  private summaryPath(userId: string, conversationId: string): string {
    return join(this.conversationRoot(userId, conversationId), 'summary.json');
  }

  private memoryFactsPath(userId: string, characterId: string): string {
    return join(this.userRoot(userId), 'memory-facts', `${sanitizeSegment(characterId)}.json`);
  }

  private ragDocumentPath(userId: string, documentId: string): string {
    return join(this.userRoot(userId), 'rag', 'documents', `${sanitizeSegment(documentId)}.json`);
  }

  private ragIndexPath(userId: string): string {
    return join(this.userRoot(userId), 'rag', 'index.json');
  }

  private userRoot(userId: string): string {
    return join(this.rootDir, 'users', sanitizeSegment(userId));
  }

  private async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      const content = await readFile(path, 'utf8');
      return JSON.parse(content) as T;
    } catch (error) {
      if (isMissingFile(error)) {
        return fallback;
      }

      throw error;
    }
  }

  private async readJsonOrNull<T>(path: string): Promise<T | null> {
    try {
      const content = await readFile(path, 'utf8');
      return JSON.parse(content) as T;
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }

      throw error;
    }
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, '-');
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
