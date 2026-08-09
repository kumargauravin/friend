import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';

const cliPath = join(process.cwd(), 'apps/api/dist/main.js');
const output = execFileSync('node', [cliPath], {
  env: { ...process.env, FRIEND_RUN_MODE: 'describe' },
}).toString();

assert.match(output, /agent workflow/i);
assert.match(output, /JSON path/i);
assert.match(output, /RAG/i);

const port = 3310;
const server = spawn('node', [cliPath], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATA_DIR: join(process.cwd(), 'tmp', `api-e2e-${Date.now()}`),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForServer(`http://127.0.0.1:${port}/health`);

  const metadataResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(metadataResponse.status, 200);
  const metadata = (await metadataResponse.json()) as { llmMode: string; uiPath: string };
  assert.equal(metadata.uiPath, '/ui');
  assert.match(metadata.llmMode, /local demo reply|vertex:/i);

  const uiResponse = await fetch(`http://127.0.0.1:${port}/ui`);
  assert.equal(uiResponse.status, 200);
  const uiHtml = await uiResponse.text();
  assert.match(uiHtml, /friend api playground/i);

  const userResponse = await postJson(`http://127.0.0.1:${port}/users`, {
    email: 'demo@example.com',
    password: 'demo-pass-123',
  });
  assert.ok(userResponse.id);

  const characterResponse = await postJson(`http://127.0.0.1:${port}/characters`, {
    userId: userResponse.id,
    name: 'Mira',
    description: 'Helpful AI friend',
    answers: Array.from({ length: 15 }, (_, index) => ({
      questionId: `q-${index + 1}`,
      question: `Question ${index + 1}`,
      answer: 'Stay helpful and grounded.',
    })),
  });
  assert.ok(characterResponse.id);

  const chatResponse = await postJson(`http://127.0.0.1:${port}/chat`, {
    userId: userResponse.id,
    characterId: characterResponse.id,
    message: 'Call me Gav and remember that I like TypeScript.',
  });
  assert.ok(chatResponse.userMessage);
  assert.ok(chatResponse.assistantMessage);
  assert.ok(chatResponse.conversation);
  assert.equal(chatResponse.userMessage.role, 'user');
  assert.equal(chatResponse.assistantMessage.role, 'assistant');
  assert.ok(chatResponse.conversation.id);

  process.stdout.write('api-e2e smoke check passed\n');
} finally {
  server.kill('SIGTERM');
  await once(server, 'exit');
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry until the server is ready
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Server did not become ready: ${url}`);
}

interface JsonApiResponse {
  id?: string;
  llmMode?: string;
  uiPath?: string;
  conversation?: { id: string };
  userMessage?: { role: string; content: string };
  assistantMessage?: { role: string; content: string };
  error?: string;
}

async function postJson(url: string, body: unknown): Promise<JsonApiResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as JsonApiResponse;
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
}
