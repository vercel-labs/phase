import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ScanDiag } from '../../skills/phase/scripts/scan.d.mts';
import {
  scanFile,
  scanTargets,
  SEVERITY_ORDER,
  SIGNALS,
} from '../../skills/phase/scripts/scan.mjs';

/**
 * Executable-example suite for the audit scanner. Every signal in the
 * catalog carries inline examples; this suite verifies each `match`
 * example produces a finding for that signal and each `noMatch` example
 * does not. A signal without both kinds of examples fails structurally.
 * CLI smoke tests and committed goldens cover the output contract.
 */

const NOISE_TIERS = new Set(['precise', 'normal', 'noisy']);

// Vitest runs with the repo root as cwd.
const SCRIPT = join(process.cwd(), 'skills/phase/scripts/scan.mjs');
const SCENARIO_DIR = join(
  process.cwd(),
  'skills/phase/evals/scenarios/audit-planted-defects',
);
const METADATA = join(process.cwd(), 'skills/phase/metadata.json');

interface CliRun {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd: string = SCENARIO_DIR): CliRun {
  const run = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
}

describe('scan signal catalog', () => {
  it('has unique ids', () => {
    const ids = SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const signal of SIGNALS) {
    describe(signal.id, () => {
      it('declares complete triage metadata', () => {
        expect(SEVERITY_ORDER).toContain(signal.severity);
        expect(NOISE_TIERS.has(signal.noise)).toBe(true);
        expect(signal.why.length).toBeGreaterThan(0);
        expect(signal.fix.startsWith('references/')).toBe(true);
        if (signal.supersedes) {
          expect(SIGNALS.some((s) => s.id === signal.supersedes)).toBe(true);
        }
      });

      it('declares at least one match and one noMatch example', () => {
        expect(signal.examples.match.length).toBeGreaterThan(0);
        expect(signal.examples.noMatch.length).toBeGreaterThan(0);
      });

      for (const [index, example] of signal.examples.match.entries()) {
        it(`match example ${index + 1} (${example.file}) fires`, () => {
          const findings = scanFile(example.file, example.content);
          const own = findings.filter((f) => f.signal === signal.id);
          expect(own.length).toBeGreaterThan(0);
        });
      }

      for (const [index, example] of signal.examples.noMatch.entries()) {
        it(`noMatch example ${index + 1} (${example.file}) stays silent`, () => {
          const findings = scanFile(example.file, example.content);
          const own = findings.filter((f) => f.signal === signal.id);
          expect(own).toEqual([]);
        });
      }
    });
  }
});

describe('file selection', () => {
  it('matches uppercase extensions (case-insensitive filesystems)', () => {
    const findings = scanFile(
      'src/Card.TSX',
      '<div className="transition-all" />;\n',
    );
    expect(findings.some((f) => f.signal === 'tailwind-transition-all')).toBe(
      true,
    );
  });

  it('excludes agent-config dirs and the skill eval fixtures', () => {
    const raf = 'requestAnimationFrame(t);\n';
    expect(scanFile('.agents/skills/phase/tool.ts', raf)).toEqual([]);
    expect(scanFile('.cursor/rules/example.ts', raf)).toEqual([]);
    expect(
      scanFile('skills/phase/evals/scenarios/x/workspace/src/t.ts', raf),
    ).toEqual([]);
  });
});

describe('matcher windows', () => {
  it('does not flag a long WhenVisible tag whose fallback comes late', () => {
    const props = Array.from({ length: 16 }, (_, i) => `  p${i}={v}`).join(
      '\n',
    );
    const tag = `<WhenVisible\n${props}\n  fallback={<Box />}\n>\n`;
    const findings = scanFile('src/x.tsx', tag);
    expect(
      findings.filter((f) => f.signal === 'when-visible-no-fallback'),
    ).toEqual([]);
  });
});

describe('environment context', () => {
  it('detects Next.js App Router and PPR from the ssr-semantics workspace', () => {
    const result = scanTargets([
      'skills/phase/evals/scenarios/ssr-semantics-guard/workspace',
    ]);
    expect(result.context.framework).toBe('next');
    expect(result.context.appRouter).toBe(true);
    expect(result.context.ppr).toBe(true);
  });

  it('reports no framework for the plain fixture workspace', () => {
    const result = scanTargets([
      'skills/phase/evals/scenarios/false-positive-discipline/workspace',
    ]);
    expect(result.context.framework).toBe(null);
  });

  it('points the reader at Step 2.5 when Next.js is detected', () => {
    const run = runCli(['../ssr-semantics-guard/workspace']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Context: Next.js + App Router + PPR');
    expect(run.stdout).toContain('Step 2.5');
  });
});

describe('suppression directive', () => {
  const RAF_WITH_DIRECTIVE =
    '// phase-scan-ignore manual-raf -- accepted: replaced next sprint\n' +
    'requestAnimationFrame(step);\n';

  it('suppresses the named signal on the next line and counts it', () => {
    const diag: ScanDiag = { suppressed: 0, warnings: [] };
    const findings = scanFile('src/anim.ts', RAF_WITH_DIRECTIVE, diag);
    expect(findings.filter((f) => f.signal === 'manual-raf')).toEqual([]);
    expect(diag.suppressed).toBe(1);
    expect(diag.warnings).toEqual([]);
  });

  it('does not suppress other signals on the same line', () => {
    const findings = scanFile('src/anim.ts', RAF_WITH_DIRECTIVE);
    const others = findings.filter(
      (f) => f.signal === 'missing-reduced-motion',
    );
    expect(others.length).toBe(1);
  });

  it('ignores a directive without a reason and warns', () => {
    const diag: ScanDiag = { suppressed: 0, warnings: [] };
    const findings = scanFile(
      'src/anim.ts',
      '// phase-scan-ignore manual-raf\nrequestAnimationFrame(step);\n',
      diag,
    );
    expect(findings.some((f) => f.signal === 'manual-raf')).toBe(true);
    expect(diag.suppressed).toBe(0);
    expect(diag.warnings.length).toBe(1);
    expect(diag.warnings[0]).toContain('missing a reason');
  });

  it('warns on an unknown signal id instead of silently ignoring the typo', () => {
    const diag: ScanDiag = { suppressed: 0, warnings: [] };
    const findings = scanFile(
      'src/anim.ts',
      '// phase-scan-ignore manual-raff -- typo\nrequestAnimationFrame(step);\n',
      diag,
    );
    expect(findings.some((f) => f.signal === 'manual-raf')).toBe(true);
    expect(diag.suppressed).toBe(0);
    expect(diag.warnings.length).toBe(1);
    expect(diag.warnings[0]).toContain('unknown signal');
  });

  it('suppresses a per-file signal for the whole file, not just one line', () => {
    const diag: ScanDiag = { suppressed: 0, warnings: [] };
    const findings = scanFile(
      'src/anim.ts',
      '// phase-scan-ignore missing-reduced-motion -- decorative, owner approved\nrequestAnimationFrame(a);\nrequestAnimationFrame(b);\n',
      diag,
    );
    expect(
      findings.filter((f) => f.signal === 'missing-reduced-motion'),
    ).toEqual([]);
    expect(diag.suppressed).toBe(1);
  });

  it('does not count a dangling directive with nothing to suppress', () => {
    const diag: ScanDiag = { suppressed: 0, warnings: [] };
    scanFile(
      'src/anim.ts',
      '// phase-scan-ignore missing-reduced-motion -- leftover\nconst x = 1;\n',
      diag,
    );
    expect(diag.suppressed).toBe(0);
  });

  it('accepts the colon form of the directive', () => {
    const diag: ScanDiag = { suppressed: 0, warnings: [] };
    const findings = scanFile(
      'src/anim.ts',
      '// phase-scan-ignore: manual-raf -- accepted one-shot\nrequestAnimationFrame(step);\n',
      diag,
    );
    expect(findings.filter((f) => f.signal === 'manual-raf')).toEqual([]);
    expect(diag.suppressed).toBe(1);
  });
});

describe('scan CLI', () => {
  it('text output matches the committed golden', () => {
    const golden = readFileSync(`${SCENARIO_DIR}/expected-scan.txt`, 'utf8');
    const run = runCli(['workspace']);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(golden);
  });

  it('--json output matches the committed golden and the skill version', () => {
    const golden = JSON.parse(
      readFileSync(`${SCENARIO_DIR}/expected-scan.json`, 'utf8'),
    );
    const run = runCli(['--json', 'workspace']);
    expect(run.status).toBe(0);
    const actual = JSON.parse(run.stdout);
    expect(actual).toEqual(golden);
    const metadata = JSON.parse(readFileSync(METADATA, 'utf8'));
    expect(actual.skillVersion).toBe(metadata.version);
  });

  it('reports reason-less directives as warnings on stderr', () => {
    const run = runCli(['workspace']);
    expect(run.stderr).toContain('phase-scan-ignore is missing a reason');
  });

  it('includes warnings in --json output for machine consumers', () => {
    const run = runCli(['--json', 'workspace']);
    const actual = JSON.parse(run.stdout);
    expect(actual.warnings.length).toBe(1);
    expect(actual.warnings[0]).toContain('missing a reason');
  });

  it('distinguishes a clean scan from scanning nothing', () => {
    // skills/phase/dist contains only the zip: zero scannable files.
    const empty = runCli(['../../../dist']);
    expect(empty.status).toBe(0);
    expect(empty.stdout).toContain('No scannable files found');
    expect(empty.stdout).not.toContain('✓');
  });

  it('--fail-on exits 1 when the threshold is hit', () => {
    expect(runCli(['--fail-on', 'critical', 'workspace']).status).toBe(1);
    expect(runCli(['workspace']).status).toBe(0);
  });

  it('accepts individual files as targets, keeping the path as given', () => {
    const run = runCli(['--json', 'workspace/src/ticker.ts']);
    expect(run.status).toBe(0);
    const actual = JSON.parse(run.stdout);
    expect(actual.summary.filesScanned).toBe(1);
    expect(
      actual.findings.every(
        (f: { file: string }) => f.file === 'workspace/src/ticker.ts',
      ),
    ).toBe(true);
  });

  it('applies path exclusions to file targets (diff-scoped scans)', () => {
    // Excluded-directory context must survive when the file is passed
    // directly, as in `git diff --name-only | xargs node scan.mjs`.
    const run = runCli(['--json', '../../../../../src/__tests__/scan.spec.ts']);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout).findings).toEqual([]);
  });

  it('prints usage on --help', () => {
    const run = runCli(['--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Usage:');
  });

  it('exits 2 with usage on an unknown option or missing target', () => {
    const unknown = runCli(['--nope']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('Usage:');
    const missing = runCli(['no-such-dir']);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('does not exist');
  });
});
