import { replaceMarkerBlock } from './marker-block.mjs';
import { isSignalTableFresh, renderSignalTable } from './scan-docs.mjs';

describe('scan documentation generation', () => {
  it('round-trips catalog metadata without constraining signal ids', () => {
    const signals = [
      {
        id: 'signal-2',
        severity: 'high',
        noise: 'normal',
        detects: 'A digit-bearing signal id',
        fix: 'references/performance.md#observer-pooling',
      },
    ];
    const table = renderSignalTable(signals);
    const audit = replaceMarkerBlock(
      '<!-- signal-table:begin -->\nold\n<!-- signal-table:end -->',
      'signal-table',
      table,
    );

    expect(table).toContain('| `signal-2`');
    expect(table).toContain('| high');
    expect(table).toContain('| normal');
    expect(table).toContain('| A digit-bearing signal id');
    expect(table).toContain(
      '[performance.md](./performance.md#observer-pooling)',
    );
    expect(isSignalTableFresh(audit, signals)).toBe(true);
  });
});
