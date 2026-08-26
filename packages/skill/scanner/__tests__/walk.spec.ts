import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { newDiag, scanTargets } from '../index.ts';
import { toPathMatcher, walk } from '../walk.ts';

describe('walk/toPathMatcher', () => {
  it('matches plain patterns as substrings, including in absolute paths', () => {
    const matches = toPathMatcher('test');
    expect(matches('/tmp/contest/src/file.ts')).toBe(true);
    expect(matches('/tmp/source/src/file.ts')).toBe(false);
  });

  it('keeps single wildcards within a segment and double wildcards recursive', () => {
    expect(toPathMatcher('src/*.ts')('src/file.ts')).toBe(true);
    expect(toPathMatcher('src/*.ts')('src/nested/file.ts')).toBe(false);
    expect(toPathMatcher('src/**/file.ts')('src/file.ts')).toBe(true);
    expect(toPathMatcher('src/**/file.ts')('src/nested/deep/file.ts')).toBe(
      true,
    );
  });

  it('applies slash-free globs to the basename', () => {
    const matches = toPathMatcher('*.spec.ts');
    expect(matches('/tmp/project/src/example.spec.ts')).toBe(true);
    expect(matches('/tmp/project/src/example.ts')).toBe(false);
  });

  it('walks supported files in stable order while skipping generated files and directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-walk-'));
    try {
      mkdirSync(join(root, 'src'));
      mkdirSync(join(root, 'node_modules'));
      writeFileSync(join(root, 'z.ts'), '');
      writeFileSync(join(root, 'a.css'), '');
      writeFileSync(join(root, 'types.d.ts'), '');
      writeFileSync(join(root, 'bundle.min.js'), '');
      writeFileSync(join(root, 'README.md'), '');
      writeFileSync(join(root, 'src', 'b.tsx'), '');
      writeFileSync(join(root, 'node_modules', 'ignored.ts'), '');
      symlinkSync(join(root, 'src'), join(root, 'linked'));

      const files = walk(root, newDiag()).map((file) =>
        file.slice(root.length + 1),
      );
      expect(files).toEqual(['a.css', 'src/b.tsx', 'z.ts']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('pins generated and excluded behavior for directory and file targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-targets-'));
    try {
      mkdirSync(join(root, '__tests__'));
      const generated = join(root, 'types.d.ts');
      const excluded = join(root, '__tests__', 'example.ts');
      writeFileSync(generated, 'requestAnimationFrame(tick);');
      writeFileSync(excluded, 'requestAnimationFrame(tick);');

      const directory = scanTargets([root]);
      const generatedFile = scanTargets([generated]);
      const excludedFile = scanTargets([excluded]);

      expect(directory.filesScanned).toBe(0);
      expect(directory.filesSkipped.generated).toBe(0);
      expect(directory.filesSkipped.excluded).toBe(1);
      expect(generatedFile.filesSkipped.generated).toBe(1);
      expect(generatedFile.filesSkipped.excluded).toBe(0);
      expect(excludedFile.filesSkipped.excluded).toBe(1);
      expect(excludedFile.filesSkipped.generated).toBe(0);
      expect(generatedFile.findings).toEqual([]);
      expect(excludedFile.findings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
