import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyPhaseToUsephase } from '../../../src/migrations/phase-to-usephase/apply.js';
import { planPhaseToUsephase } from '../../../src/migrations/phase-to-usephase/plan.js';

const FIXTURES = new URL('../../fixtures/', import.meta.url);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
}

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'usephase-apply-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('phase-to-usephase plan application', () => {
  it('applies every change atomically and preserves file mode', () => {
    const consumer = temporaryDirectory();
    mkdirSync(join(consumer, 'src'));
    const sourcePath = join(consumer, 'src/consumer.ts');
    writeFileSync(sourcePath, fixture('core-only.input.txt'));
    chmodSync(sourcePath, 0o664);
    writeFileSync(
      join(consumer, 'package.json'),
      '{"private":true,"dependencies":{"phase":"^0.5.4"}}\n',
    );
    const plan = planPhaseToUsephase({ cwd: consumer, target: '.' });
    const previousUmask = process.umask(0o077);

    let result;
    try {
      result = applyPhaseToUsephase(plan);
    } finally {
      process.umask(previousUmask);
    }

    expect(result).toEqual({ kind: 'applied' });
    expect(readFileSync(sourcePath, 'utf8')).toBe(
      fixture('core-only.output.txt'),
    );
    expect(statSync(sourcePath).mode % 0o1000).toBe(0o664);
    expect(
      readdirSync(join(consumer, 'src')).filter((entry) =>
        entry.startsWith('.usephase-codemod-'),
      ),
    ).toEqual([]);
  });

  it('returns the applied prefix when a later file changed after planning', () => {
    const consumer = temporaryDirectory();
    const source = fixture('core-only.input.txt');
    writeFileSync(join(consumer, 'a.ts'), source);
    writeFileSync(join(consumer, 'b.ts'), source);
    const plan = planPhaseToUsephase({ cwd: consumer, target: '.' });
    writeFileSync(join(consumer, 'b.ts'), '// concurrent edit\n');

    const result = applyPhaseToUsephase(plan);

    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.stage).toBe('apply');
    expect(result.failedChange.displayPath).toBe('b.ts');
    expect(result.appliedChanges.map((change) => change.displayPath)).toEqual([
      'a.ts',
    ]);
    expect(readFileSync(join(consumer, 'a.ts'), 'utf8')).toBe(
      fixture('core-only.output.txt'),
    );
    expect(readFileSync(join(consumer, 'b.ts'), 'utf8')).toBe(
      '// concurrent edit\n',
    );
  });
});
