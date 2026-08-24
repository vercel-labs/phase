import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ScanFinding, ScanResult } from '../index.ts';
import { formatJson, formatText, scanFile } from '../index.ts';

const SCRIPT = join(process.cwd(), 'skills/phase/scripts/scan.mjs');
const SCENARIO_DIR = join(
  process.cwd(),
  'evals/scenarios/audit-planted-defects',
);

interface CliRun {
  status: number;
  stdout: string;
  stderr: string;
}

function findingOf(
  file: string,
  line: number,
  execution: ScanFinding['execution'] = 'incidental',
): ScanFinding {
  return {
    signal: 'forced-reflow',
    severity: 'critical',
    noise: 'precise',
    execution,
    file,
    line,
    text: 'const width = target.offsetWidth;',
    fix: 'references/use-size.md',
  };
}

function resultOf(findings: ScanFinding[]): ScanResult {
  return {
    targets: ['src'],
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
  };
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

describe('render', () => {
  it('caps a signal listing at twenty hand-built findings', () => {
    const findings = Array.from({ length: 21 }, (_, index) =>
      findingOf(`src/file-${index}.ts`, index + 1),
    );
    const text = formatText(resultOf(findings));

    expect((text.match(/src\/file-\d+\.ts:/g) ?? []).length).toBe(20);
    expect(text).toContain('and 1 more');
  });

  it('caps each file at four entries without hiding other files', () => {
    const findings = [
      ...Array.from({ length: 6 }, (_, index) =>
        findingOf('src/busy.ts', index + 1),
      ),
      findingOf('src/other.ts', 1),
    ];
    const text = formatText(resultOf(findings));

    expect((text.match(/src\/busy\.ts:/g) ?? []).length).toBe(4);
    expect(text).toContain('src/other.ts:1');
  });

  it('orders per-frame findings first and labels only mixed execution groups', () => {
    const mixed = formatText(
      resultOf([
        findingOf('src/cold.ts', 1),
        findingOf('src/hot.ts', 2, 'per-frame'),
      ]),
    );
    const allHot = formatText(
      resultOf([findingOf('src/hot.ts', 2, 'per-frame')]),
    );

    expect(mixed.indexOf('src/hot.ts')).toBeLessThan(
      mixed.indexOf('src/cold.ts'),
    );
    expect(mixed).toContain('↑ in a per-frame path:');
    expect(mixed).toContain('· elsewhere:');
    expect(allHot).not.toContain('↑ in a per-frame path:');
  });

  it('shows hotspots only once the report reaches the threshold', () => {
    const four = Array.from({ length: 4 }, (_, index) =>
      findingOf(index < 2 ? 'src/busy.ts' : `src/${index}.ts`, index + 1),
    );
    const five = [...four, findingOf('src/other.ts', 5)];

    expect(formatText(resultOf(four))).not.toContain('## hotspots');
    expect(formatText(resultOf(five))).toContain('## hotspots');
  });

  it('limits returned JSON without changing full-result summary counts', () => {
    const json = formatJson(
      resultOf([
        findingOf('src/a.ts', 1, 'per-frame'),
        findingOf('src/a.ts', 2),
        findingOf('src/b.ts', 1),
      ]),
      1,
    );

    expect(json.findings).toHaveLength(1);
    expect(json.summary).toMatchObject({
      total: 3,
      sites: 3,
      returned: 1,
      actionable: 3,
      perFrame: 1,
      bySeverity: { critical: 3, high: 0, medium: 0 },
    });
    expect(json.hotspots).toEqual([{ file: 'src/a.ts', count: 2 }]);
  });
});

describe('output', () => {
  function render(findings: ScanFinding[], overrides = {}) {
    return formatText({
      ...resultOf(findings),
      ...overrides,
    });
  }

  it('caps per-signal listings and points at the scoped drill-down', () => {
    const content = `function step() {\n${Array.from(
      { length: 25 },
      () => '  requestAnimationFrame(step);',
    ).join('\n')}\n}`;
    const text = render(scanFile('src/storm.ts', content));
    // One file may fill only part of a signal's listing.
    expect(text).toContain('src/storm.ts:2');
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
      `function step() { requestAnimationFrame(step); } // ${'y'.repeat(900)}\n`,
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

  it('strips ANSI escape sequences from excerpts', () => {
    // Scanned code is untrusted: an escape sequence quoted verbatim can
    // restyle or hide report text in the reader's terminal.
    const [finding] = scanFile(
      'src/evil.ts',
      'const w = el.offsetWidth; // \u001b[8mconceal\u001b[0m \u001b]8;;https://evil.test\u0007link\u001b]8;;\u0007\n',
    );
    expect(finding?.text).toContain('conceal');
    expect(finding?.text).not.toContain('\u001b');
    expect(finding?.text).not.toContain('\u0007');
  });

  it('strips bidi overrides and stray control characters from excerpts', () => {
    // A bidi override makes a quoted line read differently than it parses
    // (trojan source); C0/C1 controls have no place in a one-line excerpt.
    const [finding] = scanFile(
      'src/evil.ts',
      'const w = el.offsetWidth; // \u202Edetrevni\u202C and\u0000null\u009Fapc\n',
    );
    expect(finding?.text).toContain('detrevni');
    expect(finding?.text).not.toMatch(
      // oxlint-disable-next-line no-control-regex -- asserting controls were stripped
      /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/,
    );
  });

  it('opens findings-bearing text output with the untrusted-data notice', () => {
    const notice = 'untrusted source data';
    const text = render(scanFile('src/a.ts', 'const w = el.offsetWidth;\n'));
    expect(text.split('\n')[0]).toContain(notice);
    expect(render([])).not.toContain(notice);
  });
});

describe('environment context rendering', () => {
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

describe('scan CLI', () => {
  it('reads metadata.json relative to the installed built bundle', () => {
    // The built artifact resolves ../metadata.json from its own
    // import.meta.url; bundling must not break that layout contract.
    const root = mkdtempSync(join(tmpdir(), 'phase-installed-skill-'));
    const scripts = join(root, 'scripts');
    const workspace = join(root, 'workspace');
    mkdirSync(scripts);
    mkdirSync(workspace);

    try {
      const installedScript = join(scripts, 'scan.mjs');
      writeFileSync(installedScript, readFileSync(SCRIPT, 'utf8'));
      writeFileSync(join(root, 'metadata.json'), '{ "version": "9.9.9" }\n');
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
      expect(JSON.parse(run.stdout).skillVersion).toBe('9.9.9');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads the installed skill version when metadata.json is absent', () => {
    // Deliberately not realpath'd: on macOS this is a /var -> /private/var
    // symlink, which is the shape that made the CLI exit silently.
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
    const empty = runCli(['../../../skills/phase/dist']);
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
    const run = runCli(['--json', '../../../scanner/__tests__/render.spec.ts']);
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

  it('carries the untrusted-data notice in JSON output', () => {
    const actual = JSON.parse(runCli(['--json', 'workspace']).stdout);
    expect(actual.notice).toContain('untrusted source data');
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
