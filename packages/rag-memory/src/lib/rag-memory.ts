import { randomUUID } from 'node:crypto';

import { normalizeSearchTerms } from '@friend-workspace/contracts';
import type { RagDocumentInput, RagDocumentRecord, RagSearchHit } from '@friend-workspace/contracts';

const DEFAULT_CHUNK_WORDS = 120;
const DEFAULT_CHUNK_OVERLAP = 24;

export function chunkDocumentText(
  text: string,
  maxWords = DEFAULT_CHUNK_WORDS,
  overlapWords = DEFAULT_CHUNK_OVERLAP
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  if (words.length <= maxWords) {
    return [words.join(' ')];
  }

  const chunks: string[] = [];

  for (let cursor = 0; cursor < words.length; cursor += maxWords - overlapWords) {
    const slice = words.slice(cursor, cursor + maxWords);
    if (slice.length === 0) {
      continue;
    }

    chunks.push(slice.join(' '));

    if (cursor + maxWords >= words.length) {
      break;
    }
  }

  return chunks;
}

export function createRagDocument(input: RagDocumentInput): RagDocumentRecord {
  const createdAt = new Date().toISOString();
  const chunks = chunkDocumentText(input.content).map((text, order) => ({
    id: randomUUID(),
    order,
    text,
    keywords: normalizeSearchTerms(text),
  }));

  return {
    id: randomUUID(),
    userId: input.userId,
    characterId: input.characterId,
    title: input.title,
    kind: input.kind,
    content: input.content,
    keywords: normalizeSearchTerms(`${input.title} ${input.content}`),
    chunks,
    metadata: input.metadata ?? {},
    createdAt,
    updatedAt: createdAt,
  };
}

export function rankRagHits(query: string, documents: RagDocumentRecord[], limit: number): RagSearchHit[] {
  const terms = normalizeSearchTerms(query);

  return documents
    .flatMap((document) =>
      document.chunks.map((chunk) => {
        const overlap = terms.filter((term) => chunk.keywords.includes(term)).length;
        const titleBoost = terms.filter((term) => document.keywords.includes(term)).length * 0.25;

        return {
          documentId: document.id,
          documentTitle: document.title,
          chunkId: chunk.id,
          text: chunk.text,
          keywords: chunk.keywords,
          score: overlap + titleBoost,
        };
      })
    )
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function describeRagStorageStrategy(): string[] {
  return [
    'RAG lets the app remember external knowledge without retraining the model.',
    'Each source document is split into chunks, stored once, and indexed by keywords.',
    'At chat time, only the most relevant chunks are injected into the prompt to control token cost.',
  ];
}
