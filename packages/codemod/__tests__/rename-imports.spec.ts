import { readFileSync } from 'node:fs';

import jscodeshift, { type API } from 'jscodeshift';

import transform from '../src/rename-imports.js';

const FIXTURES = new URL('fixtures/', import.meta.url);

function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), 'utf8');
}

describe('rename-imports transform', () => {
  it('rewrites every supported module form', () => {
    const input = fixture('module-forms.input.txt');
    const output = fixture('module-forms.output.txt');
    const api = {
      j: jscodeshift,
      jscodeshift,
      report: () => undefined,
      stats: () => undefined,
    } satisfies API;

    expect(transform({ path: 'consumer.tsx', source: input }, api, {})).toBe(
      output,
    );
  });

  it('replaces phase dependency entries while preserving existing scoped values', () => {
    const input = fixture('package.input.txt');
    const output = fixture('package.output.txt');
    const api = {
      j: jscodeshift,
      jscodeshift,
      report: () => undefined,
      stats: () => undefined,
    } satisfies API;

    expect(transform({ path: 'package.json', source: input }, api, {})).toBe(
      output,
    );
  });
});
