import { readMarkerBlock, replaceMarkerBlock } from './marker-block.mjs';

describe('marker blocks', () => {
  const document = [
    'before',
    '<!-- sample:begin -->',
    '```',
    'old content',
    '```',
    '<!-- sample:end -->',
    'after',
    '',
  ].join('\n');

  it('reads and replaces a fenced block', () => {
    expect(readMarkerBlock(document, 'sample', { fence: '```' })).toBe(
      'old content\n',
    );

    const updated = replaceMarkerBlock(document, 'sample', 'new content\n', {
      fence: '```',
    });

    expect(readMarkerBlock(updated, 'sample', { fence: '```' })).toBe(
      'new content\n',
    );
    expect(updated.startsWith('before\n')).toBe(true);
    expect(updated.endsWith('after\n')).toBe(true);
  });

  it('refuses content containing the closing fence', () => {
    expect(() =>
      replaceMarkerBlock(document, 'sample', 'unsafe ``` content\n', {
        fence: '```',
      }),
    ).toThrow('closing fence');
  });

  it('preserves Markdown spacing around an unfenced block', () => {
    const markdown = [
      '<!-- table:begin -->',
      '',
      '| old |',
      '',
      '<!-- table:end -->',
      '',
    ].join('\n');

    const updated = replaceMarkerBlock(markdown, 'table', '| new |\n');

    expect(readMarkerBlock(updated, 'table')).toBe('| new |\n');
    expect(updated).toBe(
      '<!-- table:begin -->\n\n| new |\n\n<!-- table:end -->\n',
    );
  });
});
