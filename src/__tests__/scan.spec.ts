import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SIGNAL_EXAMPLES } from '../../skills/phase/scripts/scan-examples.mjs';
import type { ScanFinding } from '../../skills/phase/scripts/scan.d.mts';
import {
  formatText,
  newDiag,
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

function runCli(
  args: string[],
  cwd: string = SCENARIO_DIR,
  input?: string,
): CliRun {
  const run = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    input,
  });
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
}

describe('scan signal catalog', () => {
  it('has unique ids', () => {
    const ids = SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no orphan example keys', () => {
    for (const key of Object.keys(SIGNAL_EXAMPLES)) {
      expect(SIGNALS.some((s) => s.id === key)).toBe(true);
    }
  });

  for (const signal of SIGNALS) {
    const examples = SIGNAL_EXAMPLES[signal.id] ?? { match: [], noMatch: [] };

    describe(signal.id, () => {
      it('declares complete triage metadata', () => {
        expect(SEVERITY_ORDER).toContain(signal.severity);
        expect(NOISE_TIERS.has(signal.noise)).toBe(true);
        expect(signal.why.length).toBeGreaterThan(0);
        // Printed in every block, so a reader never has to open the
        // reference to learn what to do instead.
        expect(signal.replacement.length).toBeGreaterThan(0);
        expect(signal.fix.startsWith('references/')).toBe(true);
        if (signal.supersedes) {
          expect(SIGNALS.some((s) => s.id === signal.supersedes)).toBe(true);
        }
      });

      it('has at least one match and one noMatch example', () => {
        expect(examples.match.length).toBeGreaterThan(0);
        expect(examples.noMatch.length).toBeGreaterThan(0);
      });

      for (const [index, example] of examples.match.entries()) {
        it(`match example ${index + 1} (${example.file}) fires`, () => {
          const findings = scanFile(example.file, example.content);
          const own = findings.filter((f) => f.signal === signal.id);
          expect(own.length).toBeGreaterThan(0);
        });
      }

      for (const [index, example] of examples.noMatch.entries()) {
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

  it('excludes agent-config dirs, vendored tooling, and the skill itself', () => {
    const raf = 'requestAnimationFrame(t);\n';
    expect(scanFile('.agents/skills/phase/tool.ts', raf)).toEqual([]);
    expect(scanFile('.cursor/rules/example.ts', raf)).toEqual([]);
    expect(scanFile('.yarn/releases/yarn-4.13.0.cjs', raf)).toEqual([]);
    expect(
      scanFile('skills/phase/evals/scenarios/x/workspace/src/t.ts', raf),
    ).toEqual([]);
    // The signal catalog is full of deliberate anti-patterns; a repo that
    // vendors the skill must not have them reported as its own.
    expect(scanFile('skills/phase/scripts/scan-examples.mjs', raf)).toEqual([]);
  });
});

describe('pathological input', () => {
  it('matches a long transition declaration in linear time', () => {
    // An ambiguous separator inside a quantifier made a failing match
    // exponential: a 124-character line took 27 seconds.
    const line = `.x { transition: ${'1s '.repeat(40)}allow-discrete; }`;
    const started = performance.now();
    scanFile('src/a.css', `${line}\n`);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('output', () => {
  function render(findings: ScanFinding[], overrides = {}) {
    return formatText({
      targets: ['.'],
      filesScanned: 1,
      filesSkipped: {
        excluded: 0,
        unsupported: 0,
        generated: 0,
        unreadable: 0,
        unreadableDirs: 0,
      },
      linesSkipped: 0,
      findings,
      suppressed: 0,
      warnings: [],
      context: {
        framework: null,
        appRouter: false,
        ppr: false,
        clientComponents: 0,
        evidence: [],
      },
      ...overrides,
    });
  }

  it('caps per-signal listings and points at the scoped drill-down', () => {
    const content = Array.from(
      { length: 25 },
      () => 'requestAnimationFrame(step);',
    ).join('\n');
    const text = render(scanFile('src/storm.ts', content));
    // One file may fill only part of a signal's listing.
    expect(text).toContain('src/storm.ts:1');
    expect(text).not.toContain('src/storm.ts:20');
    // Bare --json on a storm is tens of thousands of tokens; the hint must
    // send the reader to the scoped form instead.
    expect(text).toContain('more (--json --signal manual-raf');
  });

  it('names the concrete replacement and why it matters', () => {
    const text = render(scanFile('src/a.ts', 'const w = el.offsetWidth;\n'));
    expect(text).toContain('why: Synchronous layout');
    expect(text).toContain('use: useSize');
  });

  it('leads with the files carrying the most candidates', () => {
    const findings = [
      ...scanFile(
        'src/busy.ts',
        'const a = el.offsetWidth;\nconst b = el.offsetHeight;\nconst c = el.offsetTop;\nconst d = el.scrollWidth;\n',
      ),
      ...scanFile('src/quiet.ts', 'const e = el.offsetLeft;\n'),
    ];
    const text = render(findings);
    expect(text).toContain('## hotspots (most candidates per file)');
    expect(text.indexOf('src/busy.ts')).toBeLessThan(
      text.indexOf('## critical'),
    );
  });

  it('lists per-frame candidates before incidental ones', () => {
    const findings = [
      ...scanFile('src/cold.ts', 'const a = el.offsetWidth;\n'),
      ...scanFile(
        'src/hot.ts',
        'function loop() {\n  const b = el.offsetWidth;\n  requestAnimationFrame(loop);\n}\n',
      ),
    ];
    const text = render(findings);
    expect(text).toContain('↑ in a per-frame path:');
    expect(text.indexOf('src/hot.ts')).toBeLessThan(
      text.indexOf('src/cold.ts'),
    );
  });

  it('spends only part of a signal listing on one file', () => {
    const busy = Array.from(
      { length: 12 },
      () => 'const w = el.offsetWidth;',
    ).join('\n');
    const text = render([
      ...scanFile('src/busy.ts', busy),
      ...scanFile('src/other.ts', 'const h = el.offsetHeight;\n'),
    ]);
    // The rollup already says busy.ts dominates; the listing shows breadth.
    expect(text).toContain('src/other.ts:1');
    expect((text.match(/src\/busy\.ts:/g) ?? []).length).toBe(4);
  });

  it('reports coverage it did not have instead of a bare clean result', () => {
    const text = render([], {
      filesSkipped: {
        excluded: 0,
        unsupported: 0,
        generated: 0,
        unreadable: 2,
        unreadableDirs: 0,
      },
      linesSkipped: 3,
    });
    expect(text).toContain('⚠ Incomplete coverage');
    expect(text).toContain('2 file(s) unreadable');
    expect(text).toContain('3 generated/overlong line(s) not scanned');
  });

  it('stays silent about coverage when the scan read everything', () => {
    expect(render([])).not.toContain('Incomplete coverage');
  });

  it('hands a clean scan off to the manual passes instead of ending there', () => {
    // A green check with no next step is exactly where an audit stops early.
    const clean = render([]);
    expect(clean).toContain('✓ No animation anti-pattern candidates found');
    expect(clean).toContain('Beyond the scan:');
    expect(clean).toContain('Step 1.5');
  });

  it('says the same when there are findings', () => {
    expect(
      render(scanFile('src/a.ts', 'const w = el.offsetWidth;\n')),
    ).toContain('Beyond the scan:');
  });

  it('does not claim a beyond-the-scan pass when nothing was scanned', () => {
    expect(render([], { filesScanned: 0 })).not.toContain('Beyond the scan:');
  });

  it('truncates the quoted source line', () => {
    const findings = scanFile(
      'src/wide.ts',
      `const x = requestAnimationFrame(step); // ${'y'.repeat(900)}\n`,
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.text.length).toBeLessThanOrEqual(130);
    }
  });

  it('windows the excerpt around the match, not around column zero', () => {
    // Truncating from the left hid the matched utility in 8 of 12 Tailwind
    // findings on a real app: a wall of class names and no reason given.
    const className = `${'px-2 rounded-lg border '.repeat(8)}transition-all duration-300`;
    const [finding] = scanFile(
      'src/button.tsx',
      `<div className="${className}" />;\n`,
    );
    expect(finding?.text).toContain('transition-all');
    expect(finding?.text.startsWith('…')).toBe(true);
  });
});

describe('execution context', () => {
  it('marks a layout read driven by a frame loop', () => {
    const finding = scanFile(
      'src/a.ts',
      'function loop() {\n  const w = el.offsetWidth;\n  requestAnimationFrame(loop);\n}\n',
    ).find((f) => f.signal === 'forced-reflow');
    expect(finding?.execution).toBe('per-frame');
  });

  it('marks a one-shot layout read as incidental', () => {
    const finding = scanFile(
      'src/a.ts',
      'function onClick() {\n  const rect = el.getBoundingClientRect();\n}\n',
    ).find((f) => f.signal === 'forced-reflow');
    expect(finding?.execution).toBe('incidental');
  });

  it('leaves stylesheet findings unclassified', () => {
    const [finding] = scanFile('src/a.css', '.x { transition: all 0.3s; }\n');
    expect(finding?.execution).toBe(null);
  });
});

describe('coverage accounting', () => {
  it('does not count an excluded file as scanned', () => {
    const diag = newDiag();
    scanFile('src/anim.spec.ts', 'requestAnimationFrame(step);\n', diag);
    expect(diag.analyzed).toBe(0);
    expect(diag.skipped.excluded).toBe(1);
  });

  it('scans a file whose only long line is an embedded blob', () => {
    // An average-line-length heuristic dropped the whole file — findings and
    // all — over one inlined data URI.
    const content = [
      'requestAnimationFrame(step);',
      `const LOGO = 'data:image/png;base64,${'A'.repeat(20000)}';`,
    ].join('\n');
    const diag = newDiag();
    const findings = scanFile('src/hero.ts', content, diag);
    expect(findings.some((f) => f.signal === 'manual-raf')).toBe(true);
    expect(diag.analyzed).toBe(1);
    expect(diag.linesSkipped).toBe(1);
  });

  it('still finds nothing scannable in a minified bundle', () => {
    const minified =
      'var a=1;'.repeat(200) +
      "setInterval(()=>{el.style.transform='translateX(1px)'},16);";
    expect(scanFile('src/seed-bundle.mjs', minified)).toEqual([]);
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

  it('finds the Next config by walking up from a subdirectory target', () => {
    const result = scanTargets([
      'skills/phase/evals/scenarios/ssr-semantics-guard/workspace/app',
    ]);
    expect(result.context.framework).toBe('next');
    expect(result.context.ppr).toBe(true);
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
    const result = scanTargets([
      'skills/phase/evals/scenarios/ssr-semantics-guard/workspace/app/testimonials.tsx',
    ]);
    expect(result.context.framework).toBe('next');
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

  it('names the files the stamp was inferred from', () => {
    // In a monorepo the marker can come from an example app; a bare
    // assertion gives the reader no way to notice.
    const run = runCli(['../ssr-semantics-guard/workspace']);
    expect(run.stdout).toContain('(from ');
    expect(run.stdout).toContain('next.config.ts');
  });
});

describe('suppression directive', () => {
  const RAF_WITH_DIRECTIVE =
    '// phase-scan-ignore manual-raf -- accepted: replaced next sprint\n' +
    'requestAnimationFrame(step);\n';

  it('suppresses the named signal on the next line and counts it', () => {
    const diag = newDiag();
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
    const diag = newDiag();
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
    const diag = newDiag();
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
    const diag = newDiag();
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
    const diag = newDiag();
    scanFile(
      'src/anim.ts',
      '// phase-scan-ignore missing-reduced-motion -- leftover\nconst x = 1;\n',
      diag,
    );
    expect(diag.suppressed).toBe(0);
  });

  it('accepts the colon form of the directive', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      '// phase-scan-ignore: manual-raf -- accepted one-shot\nrequestAnimationFrame(step);\n',
      diag,
    );
    expect(findings.filter((f) => f.signal === 'manual-raf')).toEqual([]);
    expect(diag.suppressed).toBe(1);
  });

  it('does not interpret directive text in a string as a suppression', () => {
    const diag = newDiag();
    const findings = scanFile(
      'src/anim.ts',
      'const help = "phase-scan-ignore manual-raf -- example";\nrequestAnimationFrame(step);\n',
      diag,
    );
    expect(findings.some((f) => f.signal === 'manual-raf')).toBe(true);
    expect(diag.suppressed).toBe(0);
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

  it('reads the installed skill version when metadata.json is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-installed-skill-'));
    const scripts = join(root, 'scripts');
    const workspace = join(root, 'workspace');
    mkdirSync(scripts);
    mkdirSync(workspace);

    try {
      const installedScript = join(scripts, 'scan.mjs');
      writeFileSync(installedScript, readFileSync(SCRIPT, 'utf8'));
      writeFileSync(
        join(root, 'SKILL.md'),
        "---\nname: phase\nmetadata:\n  version: '1.2.3'\n---\n",
      );
      writeFileSync(
        join(workspace, 'clean.ts'),
        'export const clean = true;\n',
      );

      const run = spawnSync(
        process.execPath,
        [installedScript, '--json', workspace],
        { encoding: 'utf8' },
      );

      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout).skillVersion).toBe('1.2.3');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
    // directly, as in the documented `git diff ... -z | scan --stdin0`.
    const run = runCli(['--json', '../../../../../src/__tests__/scan.spec.ts']);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout).findings).toEqual([]);
  });

  it('reads NUL-delimited changed files and scans nothing on empty input', () => {
    const changed = runCli(
      ['--json', '--stdin0'],
      SCENARIO_DIR,
      'workspace/src/ticker.ts\0workspace/styles/globals.css\0',
    );
    const actual = JSON.parse(changed.stdout);
    expect(actual.summary.filesScanned).toBe(2);
    expect(actual.findings.length).toBeGreaterThan(0);

    const empty = runCli(['--json', '--stdin0'], SCENARIO_DIR, '');
    const emptyResult = JSON.parse(empty.stdout);
    expect(emptyResult.targets).toEqual([]);
    expect(emptyResult.summary.filesScanned).toBe(0);

    const root = mkdtempSync(join(tmpdir(), 'phase-scan-stdin-'));
    try {
      const spaced = join(root, 'file with space.ts');
      writeFileSync(spaced, 'requestAnimationFrame(step);\n');
      const spacedRun = runCli(
        ['--json', '--stdin0'],
        SCENARIO_DIR,
        `${spaced}\0`,
      );
      expect(JSON.parse(spacedRun.stdout).summary.filesScanned).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('counts an overlapping target once', () => {
    const both = runCli(['--json', 'workspace', 'workspace/src']);
    const only = runCli(['--json', 'workspace']);
    expect(JSON.parse(both.stdout).summary.filesScanned).toBe(
      JSON.parse(only.stdout).summary.filesScanned,
    );
  });

  it('--signal narrows the report to one signal', () => {
    const run = runCli(['--json', '--signal', 'manual-raf', 'workspace']);
    const actual = JSON.parse(run.stdout);
    expect(actual.findings.length).toBeGreaterThan(0);
    expect(
      actual.findings.every(
        (f: { signal: string }) => f.signal === 'manual-raf',
      ),
    ).toBe(true);
  });

  it('--limit caps the findings array while keeping the true total', () => {
    const run = runCli(['--json', '--limit', '2', 'workspace']);
    const actual = JSON.parse(run.stdout);
    expect(actual.findings.length).toBe(2);
    expect(actual.summary.returned).toBe(2);
    expect(actual.summary.total).toBeGreaterThan(2);
  });

  it('rejects an unknown --signal id', () => {
    const run = runCli(['--signal', 'no-such-signal', 'workspace']);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('known signal id');
  });

  it('--noise drops the tiers a triage pass does not want', () => {
    const run = runCli(['--json', '--noise', 'precise', 'workspace']);
    const actual = JSON.parse(run.stdout);
    expect(actual.findings.length).toBeGreaterThan(0);
    expect(
      actual.findings.every((f: { noise: string }) => f.noise === 'precise'),
    ).toBe(true);
  });

  it('--severity narrows to one bucket', () => {
    const run = runCli(['--json', '--severity', 'medium', 'workspace']);
    const actual = JSON.parse(run.stdout);
    expect(actual.findings.length).toBeGreaterThan(0);
    expect(
      actual.findings.every(
        (f: { severity: string }) => f.severity === 'medium',
      ),
    ).toBe(true);
  });

  it('--exclude takes a plain path fragment or a glob', () => {
    const plain = JSON.parse(
      runCli(['--json', '--exclude', 'styles/', 'workspace']).stdout,
    );
    expect(
      plain.findings.some((f: { file: string }) =>
        f.file.startsWith('styles/'),
      ),
    ).toBe(false);

    const glob = JSON.parse(
      runCli(['--json', '--exclude', '**/*.css', 'workspace']).stdout,
    );
    expect(
      glob.findings.some((f: { file: string }) => f.file.endsWith('.css')),
    ).toBe(false);

    const rootGlob = JSON.parse(
      runCli(
        ['--json', '--exclude', '**/*.ts', 'workspace/src/ticker.ts'],
        SCENARIO_DIR,
      ).stdout,
    );
    expect(rootGlob.summary.filesScanned).toBe(0);

    const basenameGlob = JSON.parse(
      runCli(['--json', '--exclude', '*.css', 'workspace']).stdout,
    );
    expect(
      basenameGlob.findings.some((f: { file: string }) =>
        f.file.endsWith('.css'),
      ),
    ).toBe(false);
  });

  it('reports hotspots and distinct sites for triage', () => {
    const actual = JSON.parse(runCli(['--json', 'workspace']).stdout);
    expect(actual.hotspots[0].count).toBeGreaterThan(1);
    expect(actual.summary.sites).toBeLessThan(actual.summary.total);
    expect(actual.summary.perFrame).toBeGreaterThan(0);
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

/**
 * The eval scenarios carry machine-checkable ground truth. Executing it here
 * is what makes them regression guards rather than prose: a scenario that
 * encodes a confirmed field failure has to fail the build when it regresses.
 */
describe('eval scenario ground truth', () => {
  interface ScanAssertions {
    required?: { signal: string; file?: string; count?: number }[];
    requiredAbsent?: { signal: string; reason: string }[];
    context?: Partial<Record<string, unknown>>;
  }

  const scenariosDir = join(process.cwd(), 'skills/phase/evals/scenarios');

  for (const scenario of readdirSync(scenariosDir).toSorted()) {
    const specPath = join(scenariosDir, scenario, 'expected-findings.json');
    if (!existsSync(specPath)) continue;
    const spec = JSON.parse(readFileSync(specPath, 'utf8'));
    const assertions: ScanAssertions | undefined = spec.scan?.assertions;
    if (!assertions) continue;

    describe(scenario, () => {
      const result = scanTargets([join(scenariosDir, scenario, 'workspace')]);

      for (const expected of assertions.required ?? []) {
        it(`reports ${expected.signal}${expected.file ? ` in ${expected.file}` : ''}`, () => {
          const hits = result.findings.filter(
            (f) =>
              f.signal === expected.signal &&
              (expected.file === undefined || f.file === expected.file),
          );
          if (expected.count === undefined) {
            expect(hits.length).toBeGreaterThan(0);
          } else {
            expect(hits.length).toBe(expected.count);
          }
        });
      }

      for (const expected of assertions.requiredAbsent ?? []) {
        it(`stays silent on ${expected.signal} (${expected.reason})`, () => {
          expect(
            result.findings.filter((f) => f.signal === expected.signal),
          ).toEqual([]);
        });
      }

      const expectedContext = assertions.context;
      if (expectedContext) {
        it('detects the declared environment context', () => {
          expect(result.context).toMatchObject(expectedContext);
        });
      }
    });
  }
});
