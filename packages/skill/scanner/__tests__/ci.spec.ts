import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { ScanJson } from '../index.ts';
import { formatGithubAnnotations, formatGithubSummary } from '../index.ts';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const SCRIPT = join(REPO_ROOT, 'skills/phase/scripts/scan.mjs');
const SCENARIO_DIR = join(
  PACKAGE_ROOT,
  'evals/scenarios/audit-planted-defects',
);

function scanJson(overrides: Partial<ScanJson> = {}): ScanJson {
  return {
    schemaVersion: 1,
    skillVersion: '0.0.46',
    notice: null,
    targets: ['src'],
    summary: {
      filesScanned: 3,
      filesSkipped: null,
      linesSkipped: 0,
      total: 4,
      sites: 4,
      returned: 4,
      actionable: 4,
      dedup: 0,
      perFrame: 0,
      suppressed: 1,
      new: 3,
      preExisting: 1,
      stale: 2,
      baselineApplied: true,
      bySeverity: { critical: 2, high: 1, medium: 1 },
    },
    hotspots: [],
    context: null,
    warnings: [],
    findings: [
      {
        signal: 'forced-reflow',
        severity: 'critical',
        noise: 'precise',
        execution: 'incidental',
        file: 'src/existing.ts',
        line: 2,
        text: 'const width = target.offsetWidth;',
        fix: 'references/performance.md#no-forced-reflows-in-animation-paths',
        fingerprint: 'forced-reflow:src/existing.ts:aaaaaaaaaaaa:1',
        baselineState: 'pre-existing',
      },
      {
        signal: 'forced-reflow',
        severity: 'critical',
        noise: 'precise',
        execution: 'incidental',
        file: 'src/hot.ts',
        line: 4,
        text: 'const width = target.offsetWidth;',
        fix: 'references/performance.md#no-forced-reflows-in-animation-paths',
        fingerprint: 'forced-reflow:src/hot.ts:bbbbbbbbbbbb:1',
        baselineState: 'new',
      },
      {
        signal: 'js-layout-write',
        severity: 'high',
        noise: 'noisy',
        execution: 'per-frame',
        file: 'src/hot.ts',
        line: 5,
        text: 'target.style.width = `${width}px`;',
        fix: 'references/performance.md#no-layout-inducing-writes-in-animation-paths',
        fingerprint: 'js-layout-write:src/hot.ts:cccccccccccc:1',
        baselineState: 'new',
      },
      {
        signal: 'raw-io',
        severity: 'medium',
        noise: 'normal',
        execution: 'incidental',
        file: 'src/other.ts',
        line: 8,
        text: 'new IntersectionObserver(callback);',
        fix: 'references/performance.md#observer-pooling',
        fingerprint: 'raw-io:src/other.ts:dddddddddddd:1',
        baselineState: 'new',
      },
    ],
    ...overrides,
  };
}

describe('GitHub job summary', () => {
  it('renders the gate verdict, new findings, counts, and hotspots', () => {
    const summary = formatGithubSummary(scanJson(), 'high');

    expect(summary).toContain(
      '**Gate: failed.** 2 new findings meet the `high` threshold.',
    );
    expect(summary).toContain(
      '| New | Pre-existing | Stale baseline entries | Suppressed |',
    );
    expect(summary).toContain('| 3 | 1 | 2 | 1 |');
    expect(summary).toContain('| critical | `forced-reflow` |');
    expect(summary).toContain('`src/hot.ts:4`');
    expect(summary).not.toContain('src/existing.ts');
    expect(summary).toContain(
      'https://github.com/vercel-labs/phase/blob/main/skills/phase/references/performance.md#no-forced-reflows-in-animation-paths',
    );
    expect(summary).toContain('| `src/hot.ts` | 2 |');
  });

  it('warns when no baseline arms the net-new comparison', () => {
    const summary = formatGithubSummary(
      scanJson({
        summary: {
          ...scanJson().summary,
          baselineApplied: false,
          preExisting: 0,
          stale: 0,
          new: 4,
        },
      }),
      'none',
    );

    expect(summary).toContain('**Gate: report only.**');
    expect(summary).toContain('**Net-new comparison is unarmed.**');
    expect(summary).toContain(
      'No baseline was applied, so every finding is treated as new.',
    );
  });

  it('keeps annotation overflow visible in the summary', () => {
    const finding = scanJson().findings[1] as ScanJson['findings'][number];
    const findings = Array.from({ length: 11 }, (_, index) => ({
      ...finding,
      file: `src/error-${index}.ts`,
      line: index + 1,
      fingerprint: `forced-reflow:src/error-${index}.ts:aaaaaaaaaaaa:1`,
    }));
    const summary = formatGithubSummary(
      scanJson({
        findings,
        summary: { ...scanJson().summary, total: 11, new: 11 },
      }),
      'critical',
    );

    expect(summary).toContain('`src/error-10.ts:11`');
  });

  it('reports stale state as unknown for a partial scan', () => {
    const summary = formatGithubSummary(
      scanJson({
        summary: { ...scanJson().summary, stale: null },
      }),
      'critical',
    );

    expect(summary).toContain('| 3 | 1 | unknown | 1 |');
  });

  it('does not report a pass when no scannable files were found', () => {
    const empty = scanJson({
      findings: [],
      summary: {
        ...scanJson().summary,
        filesScanned: 0,
        total: 0,
        sites: 0,
        returned: 0,
        actionable: 0,
        new: 0,
        preExisting: 0,
        bySeverity: { critical: 0, high: 0, medium: 0 },
      },
    });

    const summary = formatGithubSummary(empty, 'critical');

    expect(summary).toContain('**Gate: not evaluated.**');
    expect(summary).toContain('No scannable files were found');
    expect(summary).not.toContain('**Gate: passed.**');
  });

  it("stays below GitHub's job-summary limit and reports omitted rows", () => {
    const finding = scanJson().findings[1] as ScanJson['findings'][number];
    const findings = Array.from({ length: 12_000 }, (_, index) => ({
      ...finding,
      file: `src/very-long-directory-name/component-${index}.tsx`,
      line: index + 1,
      fingerprint: `forced-reflow:src/component-${index}.tsx:aaaaaaaaaaaa:1`,
    }));

    const summary = formatGithubSummary(
      scanJson({
        findings,
        summary: {
          ...scanJson().summary,
          total: findings.length,
          new: findings.length,
        },
      }),
      'critical',
    );

    expect(Buffer.byteLength(summary, 'utf8')).toBeLessThan(1024 * 1024);
    expect(summary).toContain('additional new findings omitted');
  });

  it('keeps backticks and carriage returns inside the location code span', () => {
    const finding = scanJson().findings[1] as ScanJson['findings'][number];
    const summary = formatGithubSummary(
      scanJson({
        findings: [
          {
            ...finding,
            file: 'src/` [forged](https://evil.example) `\rname.ts',
          },
        ],
        summary: { ...scanJson().summary, total: 1, new: 1 },
      }),
      'critical',
    );

    expect(summary).toContain(
      '``src/` [forged](https://evil.example) ` name.ts:4``',
    );
    expect(summary).toContain(
      '**Gate: failed.** 1 new finding meets the `critical` threshold.',
    );
  });
});

describe('GitHub annotations', () => {
  it('emits at most ten escaped commands per type and links the fix guide', () => {
    const base = scanJson().findings[1] as ScanJson['findings'][number];
    const errors = Array.from({ length: 11 }, (_, index) => ({
      ...base,
      file: index === 0 ? 'src/weird,name:100%.ts' : `src/error-${index}.ts`,
      line: index + 1,
      text:
        index === 0 ? 'read 100%\n::error::not a command' : `error ${index}`,
      fingerprint: `forced-reflow:src/error-${index}.ts:aaaaaaaaaaaa:1`,
    }));
    const warnings = Array.from({ length: 11 }, (_, index) => ({
      ...base,
      signal: 'raw-io',
      severity: 'medium' as const,
      file: `src/warning-${index}.ts`,
      line: index + 1,
      text: `warning ${index}`,
      fix: 'references/performance.md#observer-pooling',
      fingerprint: `raw-io:src/warning-${index}.ts:bbbbbbbbbbbb:1`,
    }));

    const output = formatGithubAnnotations(
      scanJson({ findings: [...errors, ...warnings] }),
      'high',
    );
    const lines = output.trim().split('\n');

    expect(lines.filter((line) => line.startsWith('::error '))).toHaveLength(
      10,
    );
    expect(lines.filter((line) => line.startsWith('::warning '))).toHaveLength(
      10,
    );
    expect(output).toContain('file=src/weird%2Cname%3A100%25.ts,line=1');
    expect(output).toContain('read 100%25%0A::error::not a command');
    expect(output).toContain(
      'https://github.com/vercel-labs/phase/blob/main/skills/phase/references/performance.md#no-forced-reflows-in-animation-paths',
    );
    expect(output).not.toContain('src/error-10.ts');
    expect(output).not.toContain('src/warning-10.ts');
  });
});

describe('GitHub CLI output', () => {
  it('treats every argument after -- as a target', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-end-options-'));
    writeFileSync(join(root, '--fail-on'), 'export const first = true;\n');
    writeFileSync(join(root, 'none'), 'export const second = true;\n');

    try {
      const run = spawnSync(
        process.execPath,
        [
          SCRIPT,
          '--format',
          'json',
          '--fail-on',
          'critical',
          '--',
          '--fail-on',
          'none',
        ],
        { cwd: root, encoding: 'utf8' },
      );

      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout).targets).toEqual(['--fail-on', 'none']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts report-only mode and writes the job summary file', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-github-output-'));
    const summaryPath = join(root, 'summary.md');

    try {
      const run = spawnSync(
        process.execPath,
        [SCRIPT, '--format', 'github', '--fail-on', 'none', 'workspace'],
        {
          cwd: SCENARIO_DIR,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
        },
      );

      expect(run.status).toBe(0);
      expect(run.stdout).toContain('::warning file=');
      expect(run.stdout).not.toContain('::error file=');
      expect(readFileSync(summaryPath, 'utf8')).toContain(
        '**Gate: report only.**',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('can write a job summary without emitting annotations', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-github-summary-only-'));
    const summaryPath = join(root, 'summary.md');

    try {
      const run = spawnSync(
        process.execPath,
        [
          SCRIPT,
          '--format',
          'github',
          '--no-annotations',
          '--fail-on',
          'none',
          'workspace',
        ],
        {
          cwd: SCENARIO_DIR,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
        },
      );

      expect(run.status).toBe(0);
      expect(run.stdout).not.toContain('::warning file=');
      expect(run.stdout).not.toContain('::error file=');
      expect(readFileSync(summaryPath, 'utf8')).toContain(
        '**Gate: report only.**',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('budgets its report against existing step-summary content', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-github-budget-'));
    const summaryPath = join(root, 'summary.md');
    writeFileSync(
      join(root, 'many.ts'),
      'const width = target.offsetWidth;\n'.repeat(12_000),
    );
    writeFileSync(summaryPath, `${'x'.repeat(200 * 1024)}\n`);

    try {
      const run = spawnSync(
        process.execPath,
        [SCRIPT, '--format', 'github', '--fail-on', 'none', '.'],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
        },
      );

      expect(run.status).toBe(0);
      const summary = readFileSync(summaryPath);
      expect(summary.byteLength).toBeLessThanOrEqual(1024 * 1024);
      expect(summary.toString()).toContain('additional new findings omitted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('--diff', () => {
  it('scans committed added, modified, and renamed files from the merge base', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-diff-'));
    const src = join(root, 'src');
    mkdirSync(src);

    try {
      git(root, 'init', '-q');
      git(root, 'config', 'user.email', 'phase@example.com');
      git(root, 'config', 'user.name', 'phase test');
      writeFileSync(
        join(src, 'base-only.ts'),
        'const width = target.offsetWidth;\n',
      );
      writeFileSync(
        join(src, 'deleted.ts'),
        'const height = target.offsetHeight;\n',
      );
      writeFileSync(
        join(src, 'modified.ts'),
        'const width = target.offsetWidth;\n',
      );
      writeFileSync(
        join(src, 'rename-old.ts'),
        'const left = target.offsetLeft;\n',
      );
      const baseline = spawnSync(
        process.execPath,
        [SCRIPT, '--write-baseline', 'phase-baseline.json', '.'],
        { cwd: root, encoding: 'utf8' },
      );
      expect(baseline.status).toBe(0);
      git(root, 'add', '.');
      git(root, 'commit', '-qm', 'initial');
      const mergeBase = git(root, 'rev-parse', 'HEAD').trim();

      git(root, 'switch', '-qc', 'target');
      writeFileSync(
        join(src, 'base-only.ts'),
        'const height = target.offsetHeight;\n',
      );
      git(root, 'commit', '-qam', 'target advanced');

      git(root, 'switch', '-qc', 'feature', mergeBase);
      writeFileSync(join(src, 'added.ts'), 'export const added = true;\n');
      writeFileSync(
        join(src, 'modified.ts'),
        'const top = target.offsetTop;\n',
      );
      renameSync(join(src, 'rename-old.ts'), join(src, 'renamed.ts'));
      unlinkSync(join(src, 'deleted.ts'));
      git(root, 'add', '-A');
      git(root, 'commit', '-qm', 'feature changes');
      writeFileSync(join(src, 'working.ts'), 'export const working = true;\n');

      const run = spawnSync(
        process.execPath,
        [SCRIPT, '--format', 'json', '--diff', 'target'],
        { cwd: root, encoding: 'utf8' },
      );

      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout).targets).toEqual([
        'src/added.ts',
        'src/modified.ts',
        'src/renamed.ts',
      ]);
      expect(JSON.parse(run.stdout).summary.stale).toBe(null);

      const nested = spawnSync(
        process.execPath,
        [SCRIPT, '--format', 'json', '--diff', 'target'],
        { cwd: src, encoding: 'utf8' },
      );
      expect(nested.status).toBe(0);
      expect(JSON.parse(nested.stdout).targets).toEqual([
        'src/added.ts',
        'src/modified.ts',
        'src/renamed.ts',
      ]);

      const optionOutput = join(root, 'owned...HEAD');
      const option = spawnSync(
        process.execPath,
        [SCRIPT, '--format', 'json', '--diff', '--output=owned'],
        { cwd: root, encoding: 'utf8' },
      );
      expect(option.status).toBe(2);
      expect(existsSync(optionOutput)).toBe(false);

      const invalidBaseline = spawnSync(
        process.execPath,
        [SCRIPT, '--write-baseline', 'phase-baseline.json', '--diff', 'target'],
        { cwd: root, encoding: 'utf8' },
      );
      expect(invalidBaseline.status).toBe(2);
      expect(invalidBaseline.stderr).toContain(
        '--write-baseline cannot be combined with --diff',
      );

      const outside = join(root, '..', `phase-outside-${Date.now()}.ts`);
      writeFileSync(outside, 'const width = target.offsetWidth;\n');
      symlinkSync(outside, join(src, 'outside-link.ts'));
      git(root, 'add', 'src/outside-link.ts');
      git(root, 'commit', '-qm', 'add outside symlink');
      try {
        const symlink = spawnSync(
          process.execPath,
          [SCRIPT, '--format', 'json', '--diff', 'target'],
          { cwd: root, encoding: 'utf8' },
        );
        expect(symlink.status).toBe(2);
        expect(symlink.stderr).toContain('regular file');
      } finally {
        rmSync(outside, { force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips changed gitlinks instead of scanning their worktrees', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-diff-gitlink-'));
    try {
      git(root, 'init', '-q');
      git(root, 'config', 'user.email', 'phase@example.com');
      git(root, 'config', 'user.name', 'phase test');
      writeFileSync(join(root, 'README.md'), 'fixture\n');
      git(root, 'add', '.');
      git(root, 'commit', '-qm', 'initial');
      git(root, 'branch', 'target');
      const oid = git(root, 'rev-parse', 'HEAD').trim();
      git(
        root,
        'update-index',
        '--add',
        '--cacheinfo',
        `160000,${oid},vendor/submodule`,
      );
      git(root, 'commit', '-qm', 'add gitlink');

      const run = spawnSync(
        process.execPath,
        [SCRIPT, '--format', 'github', '--fail-on', 'none', '--diff', 'target'],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
        },
      );

      expect(run.status).toBe(0);
      expect(run.stdout).toContain('**Gate: not evaluated.**');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}
