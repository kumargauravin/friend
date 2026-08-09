import { randomUUID } from 'node:crypto';

import type {
  AgentRepository,
  AgentWorkflowOptions,
  AgentWorkflowResult,
  CharacterProfile,
  ChatMessageRecord,
  ChatTurnInput,
  ConversationRecord,
  ConversationSummaryRecord,
  CreateCharacterInput,
  CreateUserInput,
  MemoryFactRecord,
  PromptPackage,
  RagDocumentInput,
  UserRecord,
} from '@friend-workspace/contracts';
import {
  CHARACTER_QUESTION_COUNT,
  DEFAULT_MEMORY_FACT_LIMIT,
  DEFAULT_RAG_RESULT_LIMIT,
  DEFAULT_RECENT_MESSAGE_LIMIT,
  DEFAULT_SUMMARY_MESSAGE_INTERVAL,
} from '@friend-workspace/contracts';
import { createRagDocument, describeRagStorageStrategy } from '@friend-workspace/rag-memory';

export class AgentWorkflow {
  private readonly options: Required<AgentWorkflowOptions>;

  constructor(private readonly repository: AgentRepository, options: AgentWorkflowOptions = {}) {
    this.options = {
      recentMessageLimit: options.recentMessageLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT,
      memoryFactLimit: options.memoryFactLimit ?? DEFAULT_MEMORY_FACT_LIMIT,
      ragResultLimit: options.ragResultLimit ?? DEFAULT_RAG_RESULT_LIMIT,
      summaryMessageInterval: options.summaryMessageInterval ?? DEFAULT_SUMMARY_MESSAGE_INTERVAL,
    };
  }

  async registerUser(input: CreateUserInput): Promise<UserRecord> {
    const createdAt = new Date().toISOString();

    return this.repository.saveUser({
      id: randomUUID(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      createdAt,
    });
  }

  async createCharacter(input: CreateCharacterInput): Promise<CharacterProfile> {
    const existingUser = await this.repository.getUser(input.userId);

    if (!existingUser) {
      throw createWorkflowError(404, `User ${input.userId} was not found.`);
    }

    const now = new Date().toISOString();
    const character: CharacterProfile = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      description: input.description,
      systemPrompt: buildCharacterSystemPrompt(input.name, input.description, input.answers),
      answers: input.answers,
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.saveCharacter(character);
  }

  async ingestRagDocument(input: RagDocumentInput) {
    const existingUser = await this.repository.getUser(input.userId);

    if (!existingUser) {
      throw createWorkflowError(404, `User ${input.userId} was not found.`);
    }

    if (input.characterId) {
      const existingCharacter = await this.repository.getCharacter(input.userId, input.characterId);
      if (!existingCharacter) {
        throw createWorkflowError(404, `Character ${input.characterId} was not found.`);
      }
    }

    return this.repository.saveRagDocument(createRagDocument(input));
  }

  async chat(input: ChatTurnInput): Promise<AgentWorkflowResult> {
    const character = await this.repository.getCharacter(input.userId, input.characterId);

    if (!character) {
      throw createWorkflowError(404, `Character ${input.characterId} was not found.`);
    }

    const user = await this.repository.getUser(input.userId);
    if (!user) {
      throw createWorkflowError(404, `User ${input.userId} was not found.`);
    }

    const conversation = await this.ensureConversation(input.userId, input.characterId, input.conversationId);
    const userMessage = await this.repository.appendMessage(
      createMessageRecord({
        userId: input.userId,
        characterId: input.characterId,
        conversationId: conversation.id,
        role: 'user',
        content: input.message,
      })
    );

    const recentMessages = await this.repository.listRecentMessages(
      input.userId,
      conversation.id,
      this.options.recentMessageLimit
    );
    const memorySummary = (await this.repository.getSummary(input.userId, conversation.id)) ?? undefined;
    const memoryFacts = await this.repository.listMemoryFacts(
      input.userId,
      input.characterId,
      this.options.memoryFactLimit
    );
    const ragContext = await this.repository.searchRagChunks({
      userId: input.userId,
      characterId: input.characterId,
      query: input.message,
      limit: this.options.ragResultLimit,
    });

    const promptPackage = buildPromptPackage({
      character,
      user,
      recentMessages,
      memorySummary,
      memoryFacts,
      ragContext,
      userMessage,
    });

    const assistantMessage = await this.repository.appendMessage(
      createMessageRecord({
        userId: input.userId,
        characterId: input.characterId,
        conversationId: conversation.id,
        role: 'assistant',
        content: createLocalDemoReply(character, promptPackage),
      })
    );

    const extractedFacts = extractMemoryFacts(userMessage);
    if (extractedFacts.length > 0) {
      await this.repository.saveMemoryFacts(
        extractedFacts.map((fact) => ({
          id: randomUUID(),
          userId: input.userId,
          characterId: input.characterId,
          conversationId: conversation.id,
          fact,
          confidence: 0.8,
          sourceMessageIds: [userMessage.id],
          updatedAt: assistantMessage.createdAt,
        }))
      );
    }

    const latestConversation =
      (await this.repository.getConversation(input.userId, conversation.id)) ?? conversation;
    let summaryUpdated = false;

    if (latestConversation.messageCount % this.options.summaryMessageInterval === 0) {
      const conversationMessages = await this.repository.listRecentMessages(
        input.userId,
        conversation.id,
        this.options.summaryMessageInterval
      );
      const summary = summarizeConversation(character, conversationMessages, latestConversation.messageCount);

      await this.repository.saveSummary({
        conversationId: conversation.id,
        userId: input.userId,
        characterId: input.characterId,
        summary,
        updatedAt: assistantMessage.createdAt,
        coveredMessageCount: latestConversation.messageCount,
      });

      summaryUpdated = true;
    }

    return {
      conversation: latestConversation,
      promptPackage,
      userMessage,
      assistantMessage,
      summaryUpdated,
      teachingNotes: this.describeStarterArchitecture(),
    };
  }

  describeStarterArchitecture(): string[] {
    return [
      'This starter keeps the whole workflow in one Nx repo: API app, shared contracts, agent logic, storage, and RAG helpers.',
      'The app learns through retrieval and summarization, not by retraining on every message.',
      'JSON storage is acceptable for low traffic and single-writer learning projects, but move to a database before multi-instance concurrency.',
      ...describeRagStorageStrategy(),
    ];
  }

  private async ensureConversation(
    userId: string,
    characterId: string,
    conversationId?: string
  ): Promise<ConversationRecord> {
    if (conversationId) {
      const existingConversation = await this.repository.getConversation(userId, conversationId);
      if (!existingConversation) {
        throw createWorkflowError(404, `Conversation ${conversationId} was not found.`);
      }

      return existingConversation;
    }

    const conversation = createConversationRecord(userId, characterId);
    return this.repository.saveConversation(conversation);
  }
}

export function buildCharacterSystemPrompt(
  name: string,
  description: string,
  answers: CharacterProfile['answers']
): string {
  const answerBlock = answers
    .slice(0, CHARACTER_QUESTION_COUNT)
    .map((item, index) => `${index + 1}. ${item.question}: ${item.answer}`)
    .join('\n');

  return [
    `You are ${name}.`,
    description,
    'Stay consistent with the saved character design below.',
    answerBlock,
    'Use retrieved memory and RAG context when relevant, but do not invent unsupported facts.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildPromptPackage(input: {
  character: CharacterProfile;
  user: UserRecord;
  recentMessages: ChatMessageRecord[];
  memorySummary?: ConversationSummaryRecord;
  memoryFacts: MemoryFactRecord[];
  ragContext: PromptPackage['ragContext'];
  userMessage: ChatMessageRecord;
}): PromptPackage {
  const summaryBlock = input.memorySummary?.summary
    ? `Summary of older chat:\n${input.memorySummary.summary}`
    : 'Summary of older chat:\nNone yet.';
  const factBlock = input.memoryFacts.length
    ? input.memoryFacts.map((fact) => `- ${fact.fact}`).join('\n')
    : '- No durable user facts saved yet.';
  const ragBlock = input.ragContext.length
    ? input.ragContext
        .map((hit) => `- ${hit.documentTitle}: ${hit.text}`)
        .join('\n')
    : '- No external knowledge retrieved for this turn.';
  const transcript = input.recentMessages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');

  return {
    systemInstruction: input.character.systemPrompt,
    recentMessages: input.recentMessages,
    memorySummary: input.memorySummary,
    memoryFacts: input.memoryFacts,
    ragContext: input.ragContext,
    userMessage: input.userMessage,
    assembledPrompt: [
      input.character.systemPrompt,
      `User account: ${input.user.email}`,
      summaryBlock,
      `Durable facts:\n${factBlock}`,
      `RAG context:\n${ragBlock}`,
      `Recent transcript:\n${transcript}`,
      `Latest user message:\n${input.userMessage.content}`,
    ].join('\n\n'),
  };
}

function createLocalDemoReply(character: CharacterProfile, promptPackage: PromptPackage): string {
  const strongestFact = promptPackage.memoryFacts[0]?.fact ?? 'no saved facts yet';
  const strongestRag = promptPackage.ragContext[0]?.documentTitle ?? 'no RAG source';

  return [
    `${character.name} demo reply: in production this is where a hosted LLM such as Gemini would answer.`,
    `Memory recalled: ${strongestFact}.`,
    `RAG source used: ${strongestRag}.`,
    `Latest user message: "${promptPackage.userMessage.content}".`,
  ].join(' ');
}

function createMessageRecord(input: {
  userId: string;
  characterId: string;
  conversationId: string;
  role: ChatMessageRecord['role'];
  content: string;
}): ChatMessageRecord {
  return {
    id: randomUUID(),
    userId: input.userId,
    characterId: input.characterId,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    createdAt: new Date().toISOString(),
  };
}

function createConversationRecord(userId: string, characterId: string): ConversationRecord {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    userId,
    characterId,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
}

function summarizeConversation(
  character: CharacterProfile,
  messages: ChatMessageRecord[],
  coveredMessageCount: number
): string {
  const themes = Array.from(
    new Set(
      messages
        .flatMap((message) =>
          message.content
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((term) => term.length > 4)
        )
        .slice(0, 6)
    )
  );

  return [
    `${character.name} has now seen ${coveredMessageCount} messages in this conversation.`,
    themes.length ? `Recent themes: ${themes.join(', ')}.` : 'Recent themes are still forming.',
    `Most recent exchange ended with: ${messages.at(-1)?.content ?? 'no message'}`,
  ].join(' ');
}

function extractMemoryFacts(message: ChatMessageRecord): string[] {
  const candidates = [
    captureFact(message.content, /call me ([^.!?]+)/i, 'User prefers to be called $1'),
    captureFact(message.content, /i like ([^.!?]+)/i, 'User likes $1'),
    captureFact(message.content, /i love ([^.!?]+)/i, 'User loves $1'),
    captureFact(message.content, /my favorite ([^.!?]+)/i, 'User favorite is $1'),
    captureFact(message.content, /remember that ([^.!?]+)/i, 'Remember that $1'),
    captureFact(message.content, /i work as ([^.!?]+)/i, 'User works as $1'),
  ];

  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

function captureFact(text: string, expression: RegExp, template: string): string | null {
  const match = text.match(expression);
  if (!match?.[1]) {
    return null;
  }

  return template.replace('$1', match[1].trim());
}

function createWorkflowError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
