import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectFixSections, extractFixSection } from './fix-sections.mjs';

describe('fix section extraction', () => {
  it('includes nested headings and stops at the next peer heading', () => {
    const source = `# Guide

## Target

Fix this.

### Details

Keep these details.

## Next

Do not include this.`;

    expect(extractFixSection(source, 'target')).toBe(`## Target

Fix this.

### Details

Keep these details.`);
  });

  it('stops an H3 section at the next H2 heading', () => {
    const source = `## Parent

### Target

Fix this.

#### Details

Keep these details.

## Next parent

Do not include this.`;

    expect(extractFixSection(source, 'target')).not.toContain('Next parent');
  });

  it('ignores headings inside nested code fences', () => {
    const source = `## Target

\`\`\`\`md
### Not a section
\`\`\`ts
## Still not a section
\`\`\`
\`\`\`\`

Still part of the fix.

## Next`;

    expect(extractFixSection(source, 'target')).toContain(
      'Still part of the fix.',
    );
  });

  it('ignores headings inside tilde fences', () => {
    const source = `## Target

~~~md
## Not a peer heading
~~~

Still part of the fix.

## Next`;

    expect(extractFixSection(source, 'target')).toContain(
      'Still part of the fix.',
    );
  });

  it('matches ATX headings with optional closing hashes', () => {
    expect(extractFixSection('## Target ##\n\nFix.', 'target')).toContain(
      'Fix.',
    );
  });

  it('assigns GitHub-style suffixes to duplicate headings', () => {
    const source = '## Shared\n\nFirst.\n\n## Shared\n\nSecond.';
    expect(extractFixSection(source, 'shared-1')).toContain('Second.');
  });

  it('rejects ambiguous setext headings and thematic breaks', () => {
    expect(() => extractFixSection('Target\n------\n\nFix.', 'target')).toThrow(
      'setext headings and thematic breaks are unsupported in fix sections',
    );
  });

  it('rejects an empty fix section', () => {
    expect(() =>
      extractFixSection('## Empty\n\n## Next\n\nContent', 'empty'),
    ).toThrow('fix section is empty');
  });

  it('rejects a signal with a broken anchor', () => {
    const refsDir = mkdtempSync(join(tmpdir(), 'phase-fix-sections-'));
    try {
      writeFileSync(
        join(refsDir, 'guide.md'),
        '# Guide\n\n## Existing\n\nFix.',
      );
      expect(() =>
        collectFixSections(
          [
            {
              id: 'broken-signal',
              fix: 'references/guide.md#missing',
            },
          ],
          refsDir,
        ),
      ).toThrow('broken-signal: fix anchor not found: #missing');
    } finally {
      rmSync(refsDir, { recursive: true, force: true });
    }
  });
});
