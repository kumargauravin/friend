import { execSync } from 'child_process';
import { join } from 'path';

describe('CLI tests', () => {
  it('should describe the starter architecture', () => {
    const cliPath = join(process.cwd(), 'apps/api/dist/main.js');

    const output = execSync(`FRIEND_RUN_MODE=describe node ${cliPath}`, {
      env: { ...process.env, FRIEND_RUN_MODE: 'describe' },
    }).toString();

    expect(output).toMatch(/agent workflow/i);
    expect(output).toMatch(/JSON path/i);
    expect(output).toMatch(/RAG/i);
  });
});
