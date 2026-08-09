import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const cliPath = join(process.cwd(), 'apps/api/dist/main.js');
const output = execSync(`node ${cliPath}`, {
  env: { ...process.env, FRIEND_RUN_MODE: 'describe' },
}).toString();

assert.match(output, /agent workflow/i);
assert.match(output, /JSON path/i);
assert.match(output, /RAG/i);

process.stdout.write('api-e2e smoke check passed\n');
