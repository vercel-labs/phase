import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import codemods from '../codemods.json';

const PACKAGE_ROOT = new URL('../', import.meta.url);
const README = new URL('../README.md', import.meta.url);
const GENERATOR = fileURLToPath(
  new URL('../scripts/generate-readme.mjs', import.meta.url),
);
const START = '<!-- CODEMOD-TABLE:START -->';
const END = '<!-- CODEMOD-TABLE:END -->';

describe('codemod README', () => {
  it('keeps the generated catalog current and specific details out of prose', () => {
    const check = spawnSync(process.execPath, [GENERATOR, '--check'], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });
    expect(check.status, check.stderr).toBe(0);

    const readme = readFileSync(README, 'utf8');
    const start = readme.indexOf(START);
    const end = readme.indexOf(END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const table = readme.slice(start + START.length, end);
    const prose = `${readme.slice(0, start)}${readme.slice(end + END.length)}`;
    for (const codemod of codemods) {
      expect(table).toContain(codemod.name);
      expect(prose).not.toContain(codemod.name);
      for (const version of [...codemod.from, ...codemod.to]) {
        expect(table).toContain(version);
        expect(prose).not.toContain(version);
      }
    }
  });
});
