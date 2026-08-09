import { randomBytes, scryptSync } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import { AgentWorkflow } from '@friend-workspace/agent-core';
import { JsonFileRepository } from '@friend-workspace/json-store';
import type {
  CharacterKind,
  CharacterQuestionAnswer,
  RagDocumentKind,
} from '@friend-workspace/contracts';

import { createApiLlmRuntime } from './lib/vertex.js';
import { PLAYGROUND_HTML } from './lib/ui.js';

const dataDirectory = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(process.cwd(), 'data');
const repository = new JsonFileRepository(dataDirectory);
const llmRuntime = createApiLlmRuntime();
const workflow = new AgentWorkflow(repository, {
  replyGenerator: llmRuntime.replyGenerator,
});
const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

if (process.env.FRIEND_RUN_MODE === 'describe') {
  printDescribeMode();
} else {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, { ok: true, llmMode: llmRuntime.llmMode });
      }

      if (request.method === 'GET' && url.pathname === '/learn/json-db') {
        return sendJson(response, 200, {
          messagePathConvention:
            'users/<userId>/conversations/<conversationId>/messages/<YYYY-MM-DD>/chat-<HH-mm-ss-SSS>-<messageId>.json',
          notes: workflow.describeStarterArchitecture(),
        });
      }

      if (
        request.method === 'GET' &&
        (url.pathname === '/ui' || (url.pathname === '/' && requestAcceptsHtml(request)))
      ) {
        return sendHtml(response, 200, PLAYGROUND_HTML);
      }

      if (request.method === 'GET' && url.pathname === '/') {
        return sendJson(response, 200, {
          name: 'friend api starter',
          endpoints: [
            'GET /health',
            'GET /learn/json-db',
            'GET /ui',
            'POST /users',
            'GET /users/:userId/characters',
            'POST /characters',
            'POST /rag/documents',
            'POST /chat',
          ],
          llmMode: llmRuntime.llmMode,
          vertexConfigured: llmRuntime.vertexConfigured,
          vertexLocation: llmRuntime.vertexLocation,
          vertexModel: llmRuntime.vertexModel,
          uiPath: '/ui',
        });
      }

      if (request.method === 'POST' && url.pathname === '/users') {
        const body = await readJsonBody(request);
        const email = expectString(body.email, 'email');
        const passwordHash =
          typeof body.passwordHash === 'string'
            ? body.passwordHash
            : hashPassword(expectString(body.password, 'password'));

        const user = await workflow.registerUser({ email, passwordHash });
        return sendJson(response, 201, user);
      }

      if (request.method === 'GET' && /^\/users\/[^/]+\/characters$/.test(url.pathname)) {
        const userId = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const kind = parseCharacterKind(url.searchParams.get('kind'));
        const characters = await workflow.listCharacters(userId, kind);
        return sendJson(response, 200, characters);
      }

      if (request.method === 'POST' && url.pathname === '/characters') {
        const body = await readJsonBody(request);
        const character = await workflow.createCharacter({
          userId: expectString(body.userId, 'userId'),
          kind: parseCharacterKind(body.kind) ?? 'friend',
          name: expectString(body.name, 'name'),
          description: expectString(body.description, 'description'),
          answers: parseAnswers(body.answers),
        });

        return sendJson(response, 201, character);
      }

      if (request.method === 'POST' && url.pathname === '/rag/documents') {
        const body = await readJsonBody(request);
        const document = await workflow.ingestRagDocument({
          userId: expectString(body.userId, 'userId'),
          characterId: optionalString(body.characterId),
          title: expectString(body.title, 'title'),
          kind: parseRagKind(body.kind),
          content: expectString(body.content, 'content'),
          metadata: parseMetadata(body.metadata),
        });

        return sendJson(response, 201, document);
      }

      if (request.method === 'POST' && url.pathname === '/chat') {
        const body = await readJsonBody(request);
        const result = await workflow.chat({
          userId: expectString(body.userId, 'userId'),
          characterId: expectString(body.characterId, 'characterId'),
          conversationId: optionalString(body.conversationId),
          message: expectString(body.message, 'message'),
        });

        return sendJson(response, 200, result);
      }

      return sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      const statusCode =
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
          ? error.statusCode
          : 500;

      const message = error instanceof Error ? error.message : 'Unknown error';
      return sendJson(response, statusCode, { error: message });
    }
  });

  server.listen(port, host, () => {
    process.stdout.write(`friend api listening on http://${host}:${port}\n`);
  });
}

function printDescribeMode(): void {
  const lines = [
    'friend api starter',
    'Mode: describe',
    'This app keeps the agent workflow in one Nx monorepo and ships as one isolated API service.',
    'JSON path: users/<userId>/conversations/<conversationId>/messages/<YYYY-MM-DD>/chat-<HH-mm-ss-SSS>-<messageId>.json',
    ...workflow.describeStarterArchitecture(),
    `Current response mode: ${llmRuntime.llmMode}.`,
    'Open /ui in a browser to create an admin demo user, add friend/teacher characters, and test chat turns.',
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const bodyText = Buffer.concat(chunks).toString('utf8');

  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

function sendJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: unknown
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendHtml(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: string
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(payload);
}

function requestAcceptsHtml(request: IncomingMessage): boolean {
  const accept = request.headers.accept ?? '';
  return accept.includes('text/html');
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw Object.assign(new Error(`Field "${fieldName}" must be a non-empty string.`), {
      statusCode: 400,
    });
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseAnswers(value: unknown): CharacterQuestionAnswer[] {
  if (!Array.isArray(value)) {
    throw Object.assign(new Error('Field "answers" must be an array.'), { statusCode: 400 });
  }

  function parseCharacterKind(value: unknown): CharacterKind | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const kind = optionalString(value);
    const allowedKinds: CharacterKind[] = ['friend', 'teacher'];

    if (!kind || !allowedKinds.includes(kind as CharacterKind)) {
      throw Object.assign(
        new Error(`Field "kind" must be one of: ${allowedKinds.join(', ')}.`),
        {
          statusCode: 400,
        }
      );
    }

    return kind as CharacterKind;
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw Object.assign(new Error(`Answer ${index + 1} must be an object.`), { statusCode: 400 });
    }

    const answerRecord = entry as Record<string, unknown>;

    return {
      questionId: optionalString(answerRecord.questionId) ?? `q-${index + 1}`,
      question: expectString(answerRecord.question, `answers[${index}].question`),
      answer: expectString(answerRecord.answer, `answers[${index}].answer`),
    };
  });
}

function parseRagKind(value: unknown): RagDocumentKind {
  const kind = optionalString(value) ?? 'note';
  const allowedKinds: RagDocumentKind[] = ['character-lore', 'faq', 'journal', 'note', 'web'];

  if (!allowedKinds.includes(kind as RagDocumentKind)) {
    throw Object.assign(new Error(`Field "kind" must be one of: ${allowedKinds.join(', ')}.`), {
      statusCode: 400,
    });
  }

  return kind as RagDocumentKind;
}

function parseMetadata(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw Object.assign(new Error('Field "metadata" must be a plain object.'), { statusCode: 400 });
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, String(entryValue)])
  );
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}
