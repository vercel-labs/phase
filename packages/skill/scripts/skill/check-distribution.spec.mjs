import { consumerArtifactImportErrors } from './distribution.mjs';

describe('skill distribution guard', () => {
  it.each([
    ['an unknown node specifier', 'import "node:not-a-builtin";'],
    ['a re-export', 'export * from "left-pad";'],
    [
      'a multiline import',
      'import {\n  value,\n} from "left-pad";\nvoid value;',
    ],
    ['a namespace re-export', 'export * as values from "left-pad";'],
    [
      'a computed dynamic import',
      'const specifier = "node:fs"; void import(specifier);',
    ],
  ])('rejects a scanner bundle with %s', (_, scanner) => {
    expect(consumerArtifactImportErrors(scanner, 'scan.mjs')).not.toEqual([]);
  });

  it('accepts static node builtin imports and import.meta', () => {
    expect(
      consumerArtifactImportErrors(
        'import { readFileSync } from "node:fs";\nconsole.log(import.meta.url, readFileSync);',
        'scan.mjs',
      ),
    ).toEqual([]);
  });
});
