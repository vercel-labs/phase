import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanTargets } from '../index.ts';

describe('environment context', () => {
  it('detects Next.js App Router and PPR from the ssr-semantics workspace', () => {
    const result = scanTargets([
      'skills/phase/evals/scenarios/ssr-semantics-guard/workspace',
    ]);
    expect(result.context.framework).toBe('next');
    expect(result.context.appRouter).toBe(true);
    expect(result.context.ppr).toBe(true);
  });

  it('finds the Next config by walking up from a subdirectory target', () => {
    const result = scanTargets([
      'skills/phase/evals/scenarios/ssr-semantics-guard/workspace/app',
    ]);
    expect(result.context.framework).toBe('next');
    expect(result.context.appRouter).toBe(true);
    expect(result.context.ppr).toBe(true);
    expect(result.context.evidence).toContain('page.tsx');
  });

  it('retains App Router context for nested app targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-scan-next-'));
    try {
      mkdirSync(join(root, 'app', 'dashboard'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(join(root, 'next.config.mjs'), 'export default {};\n');
      writeFileSync(
        join(root, 'app', 'dashboard', 'page.tsx'),
        'export default function Page() { return null; }\n',
      );
      expect(
        scanTargets([join(root, 'app', 'dashboard')]).context.appRouter,
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains App Router and cache-components context for nested src/app targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-scan-next-'));
    try {
      mkdirSync(join(root, 'src', 'app', 'dashboard'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(
        join(root, 'next.config.mjs'),
        'export default { cacheComponents: true };\n',
      );
      writeFileSync(
        join(root, 'src', 'app', 'dashboard', 'page.tsx'),
        'export default function Page() { return null; }\n',
      );
      const result = scanTargets([join(root, 'src', 'app', 'dashboard')]);
      expect(result.context.appRouter).toBe(true);
      expect(result.context.ppr).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not treat explicitly disabled Next features as PPR', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-scan-next-'));
    try {
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(
        join(root, 'next.config.mjs'),
        'export default { cacheComponents: false, experimental: { ppr: false } };\n',
      );
      writeFileSync(join(root, 'src', 'app.ts'), 'const ready = true;\n');
      expect(scanTargets([root]).context.ppr).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('stamps context for a single file target (diff-scoped scans)', () => {
    // A NUL-delimited changed-file scan is the mode most likely to run
    // against a Next.js app, and the mode where a missing stamp would hide
    // the blast-radius warning entirely.
    const root = mkdtempSync(join(tmpdir(), 'phase-scan-next-'));
    try {
      mkdirSync(join(root, 'app', 'dashboard'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(
        join(root, 'next.config.mjs'),
        "export default { experimental: { ppr: 'incremental' } };\n",
      );
      writeFileSync(
        join(root, 'app', 'dashboard', 'page.tsx'),
        'export default function Page() { return null; }\n',
      );
      const target = join(root, 'app', 'dashboard', 'chart.tsx');
      writeFileSync(target, 'export function Chart() { return null; }\n');
      // The scanned file is not itself a route file: App Router context comes
      // from the project's router layout, not from what the diff touched.
      const result = scanTargets([target]);
      expect(result.filesScanned).toBe(1);
      expect(result.context.framework).toBe('next');
      expect(result.context.appRouter).toBe(true);
      expect(result.context.ppr).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps Pages Router targets out of App Router context', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-scan-next-'));
    try {
      mkdirSync(join(root, 'pages'));
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(join(root, 'next.config.mjs'), 'export default {};\n');
      writeFileSync(
        join(root, 'pages', 'dashboard.tsx'),
        'export default function Page() { return null; }\n',
      );
      const result = scanTargets([join(root, 'pages')]);
      expect(result.context.framework).toBe('next');
      expect(result.context.appRouter).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores a non-router app directory inside a Pages Router project', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-scan-next-'));
    try {
      mkdirSync(join(root, 'pages'), { recursive: true });
      mkdirSync(join(root, 'app', 'lib'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(join(root, 'next.config.mjs'), 'export default {};\n');
      writeFileSync(
        join(root, 'pages', 'dashboard.tsx'),
        'export default function Page() { return null; }\n',
      );
      writeFileSync(
        join(root, 'app', 'lib', 'format.ts'),
        'export const x=1;\n',
      );
      const result = scanTargets([root]);
      expect(result.context.framework).toBe('next');
      expect(result.context.appRouter).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not infer Next from an app directory in a non-Next project', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-scan-plain-'));
    try {
      mkdirSync(join(root, 'app', 'services'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(
        join(root, 'app', 'services', 'helper.ts'),
        'export function helper() { return 1; }\n',
      );
      const result = scanTargets([root]);
      expect(result.context.framework).toBe(null);
      expect(result.context.appRouter).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects App Router without a Next config file', () => {
    // next.config is optional in Next.js, so route files alone must still
    // stamp the context, including for a diff-scoped single file.
    const root = mkdtempSync(join(tmpdir(), 'phase-scan-noconfig-'));
    try {
      mkdirSync(join(root, 'app', 'dashboard'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(
        join(root, 'app', 'dashboard', 'page.tsx'),
        'export default function Page() { return null; }\n',
      );
      const chart = join(root, 'app', 'dashboard', 'chart.tsx');
      writeFileSync(chart, 'export function Chart() { return null; }\n');

      for (const target of [root, chart]) {
        const result = scanTargets([target]);
        expect(result.context.framework).toBe('next');
        expect(result.context.appRouter).toBe(true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores unrelated app directories above a Next project', () => {
    const ancestor = mkdtempSync(join(tmpdir(), 'phase-scan-app-'));
    const root = join(ancestor, 'app', 'site');
    try {
      mkdirSync(join(root, 'pages'), { recursive: true });
      writeFileSync(join(root, 'package.json'), '{}\n');
      writeFileSync(join(root, 'next.config.mjs'), 'export default {};\n');
      const target = join(root, 'pages', 'dashboard.tsx');
      writeFileSync(
        target,
        'export default function Page() { return null; }\n',
      );
      const result = scanTargets([target]);
      expect(result.context.framework).toBe('next');
      expect(result.context.appRouter).toBe(false);
    } finally {
      rmSync(ancestor, { recursive: true, force: true });
    }
  });

  it('reports no framework for the plain fixture workspace', () => {
    const result = scanTargets([
      'skills/phase/evals/scenarios/false-positive-discipline/workspace',
    ]);
    expect(result.context.framework).toBe(null);
  });
});
