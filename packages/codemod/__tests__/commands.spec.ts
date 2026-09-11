import { readFileSync } from 'node:fs';

import codemods from '../codemods.json';
import { commands } from '../src/commands.js';

describe('codemod command registry', () => {
  it('pairs every catalog entry with exactly one executable command', () => {
    const catalogEntries = codemods.map(({ id, name }) => ({ id, name }));
    const registeredEntries = commands.map(({ id, name }) => ({ id, name }));

    expect(registeredEntries).toEqual(catalogEntries);
    expect(registeredEntries).toEqual([
      {
        id: 'phase-to-usephase',
        name: 'migrate-phase-to-usephase',
      },
    ]);
    for (const command of commands) {
      expect(command.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(command.execute).toEqual(expect.any(Function));
    }
  });

  it('keeps migration implementations outside the generic CLI', () => {
    const cliSource = readFileSync(
      new URL('../src/cli.ts', import.meta.url),
      'utf8',
    );

    expect(cliSource).not.toContain('/migrations/');
  });
});
