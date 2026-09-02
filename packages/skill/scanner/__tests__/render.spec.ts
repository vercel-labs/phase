import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type {
  BaselinedScanResult,
  ClassifiedFinding,
  ScanFinding,
  UnbaselinedScanResult,
} from '../index.ts';
import {
  assignFingerprints,
  classifyFindings,
  formatJson,
  formatText,
  scanFile,
  serializeBaseline,
  parseBaseline,
} from '../index.ts';
import { GOLDEN_SCENARIO_DIR } from '../scenarios.ts';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const SCRIPT = join(REPO_ROOT, 'skills/phase/scripts/scan.mjs');
const SCENARIO_DIR = join(PACKAGE_ROOT, GOLDEN_SCENARIO_DIR);

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

function resultOf(findings: ScanFinding[]): UnbaselinedScanResult {
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

function baselinedResultOf(
  findings: ClassifiedFinding[],
  stale: number | null,
): BaselinedScanResult {
  return {
    ...resultOf([]),
    findings,
    baseline: { stale },
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
    expect(json.findings[0]?.fingerprint).toMatch(
      /^forced-reflow:src\/a\.ts:[0-9a-f]{12}:1$/,
    );
  });

  it('reports baseline classification in JSON and lists only new findings in text', () => {
    const preExisting = findingOf('src/existing.ts', 3);
    const added = findingOf('src/new.ts', 7);
    const fingerprint = assignFingerprints([preExisting])[0]?.fingerprint;
    const baseline = parseBaseline(
      serializeBaseline(
        [
          fingerprint as string,
          'manual-raf:src/removed.ts:aaaaaaaaaaaa:1',
          'forced-reflow:src/gone.ts:bbbbbbbbbbbb:1',
        ],
        '0.0.44',
        '.',
      ),
    );
    const classified = classifyFindings([preExisting, added], baseline);
    const result = baselinedResultOf(classified.findings, classified.stale);

    const json = formatJson(result);
    expect(json.summary).toMatchObject({
      new: 1,
      preExisting: 1,
      stale: 2,
    });
    expect(json.findings.map((finding) => finding.baselineState)).toEqual([
      'pre-existing',
      'new',
    ]);

    const text = formatText(result);
    expect(text).not.toContain('src/existing.ts:3');
    expect(text).toContain('src/new.ts:7');
    expect(text).toContain('Baseline: 1 new, 1 pre-existing, 2 stale.');
  });

  it('surfaces a zero stale count when no baseline applies', () => {
    expect(formatText(resultOf([]))).toContain(
      'Baseline: not applied; 0 stale.',
    );
  });

  it('keeps suppression counts in a baseline scan with no new findings', () => {
    const text = formatText({
      ...baselinedResultOf([], 0),
      suppressed: 1,
    });

    expect(text).toContain('1 suppressed');
  });

  it('reports unknown stale state for a partial baseline scan', () => {
    const text = formatText(baselinedResultOf([], null));

    expect(text).toContain('stale unknown (partial scan)');
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

  it('does not trust an unsafe installed metadata version', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-installed-skill-'));
    const scripts = join(root, 'scripts');
    const workspace = join(root, 'workspace');
    mkdirSync(scripts);
    mkdirSync(workspace);

    try {
      const installedScript = join(scripts, 'scan.mjs');
      writeFileSync(installedScript, readFileSync(SCRIPT, 'utf8'));
      writeFileSync(
        join(root, 'metadata.json'),
        JSON.stringify({ version: '9.9.9\u001b[2JINJECT' }),
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
      expect(JSON.parse(run.stdout).skillVersion).toBe('unknown');
      expect(run.stdout).not.toContain('\u001b');
      expect(run.stderr).not.toContain('\u001b');
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
    const empty = runCli([join(REPO_ROOT, 'skills/phase/dist')]);
    expect(empty.status).toBe(0);
    expect(empty.stdout).toContain('No scannable files found');
    expect(empty.stdout).not.toContain('✓');
  });

  it('--fail-on exits 1 when the threshold is hit', () => {
    expect(runCli(['--fail-on', 'critical', 'workspace']).status).toBe(1);
    expect(runCli(['workspace']).status).toBe(0);
  });

  it('writes, auto-detects, overrides, and ignores baselines', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-baseline-cli-'));
    const src = join(root, 'src');
    mkdirSync(src);
    writeFileSync(
      join(src, 'existing.ts'),
      'const width = target.offsetWidth;\n',
    );

    try {
      const baselinePath = join(root, 'phase-baseline.json');
      const written = runCli(
        [
          '--write-baseline',
          'phase-baseline.json',
          '--fail-on',
          'critical',
          '.',
        ],
        root,
      );
      expect(written.status).toBe(0);
      const baseline = parseBaseline(readFileSync(baselinePath, 'utf8'));
      expect(baseline.fingerprints).toHaveLength(1);

      const unchanged = runCli(['--fail-on', 'critical', '.'], root);
      expect(unchanged.status).toBe(0);
      expect(unchanged.stdout).toContain(
        'Baseline: 0 new, 1 pre-existing, 0 stale.',
      );
      expect(unchanged.stdout).not.toContain('src/existing.ts:1');

      const oneStdinTarget = runCli(
        ['--stdin0', '--fail-on', 'critical'],
        root,
        'src/existing.ts\0',
      );
      expect(oneStdinTarget.status).toBe(0);

      writeFileSync(
        join(src, 'new.ts'),
        'const height = target.offsetHeight;\n',
      );
      const changed = runCli(['--fail-on', 'critical', '.'], root);
      expect(changed.status).toBe(1);
      expect(changed.stdout).toContain('src/new.ts:1');
      expect(changed.stdout).not.toContain('src/existing.ts:1');

      const customPath = join(root, 'custom-baseline.json');
      writeFileSync(customPath, readFileSync(baselinePath, 'utf8'));
      rmSync(baselinePath);
      expect(
        runCli(
          ['--baseline', 'custom-baseline.json', '--fail-on', 'critical', '.'],
          root,
        ).status,
      ).toBe(1);
      expect(
        runCli(
          [
            '--baseline',
            'custom-baseline.json',
            '--no-baseline',
            '--fail-on',
            'critical',
            '.',
          ],
          root,
        ).status,
      ).toBe(1);
      expect(
        runCli(['--no-baseline', '--fail-on', 'critical', '.'], root).status,
      ).toBe(1);

      const skewed = { ...baseline, cliVersion: '0.0.1' };
      writeFileSync(customPath, `${JSON.stringify(skewed, null, 2)}\n`);
      const skewRun = runCli(['--baseline', 'custom-baseline.json', '.'], root);
      expect(skewRun.status).toBe(0);
      expect(skewRun.stderr).toContain('baseline version 0.0.1 differs');

      const missing = runCli(['--baseline', 'missing.json', '.'], root);
      expect(missing.status).toBe(2);
      expect(missing.stderr).toContain('cannot read baseline');

      writeFileSync(
        customPath,
        JSON.stringify({ ...baseline, cliVersion: '0.0.1\u001b[2JINJECT' }),
      );
      const unsafe = runCli(['--baseline', 'custom-baseline.json', '.'], root);
      expect(unsafe.status).toBe(2);
      expect(unsafe.stderr).not.toContain('\u001b');

      const unsafePath = runCli(
        ['--baseline', 'missing\u001b[2J.json', '.'],
        root,
      );
      expect(unsafePath.status).toBe(2);
      expect(unsafePath.stderr).not.toContain('\u001b');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds baseline identity to one canonical scan root', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-baseline-root-'));
    const one = join(root, 'one');
    const two = join(root, 'two');
    mkdirSync(one);
    mkdirSync(two);
    const original = join(one, 'index.ts');
    const moved = join(two, 'index.ts');
    writeFileSync(original, 'const width = target.offsetWidth;\n');

    try {
      const baselinePath = join(root, 'phase-baseline.json');
      const written = runCli(
        ['--write-baseline', 'phase-baseline.json', '.'],
        root,
      );
      expect(written.status).toBe(0);
      expect(parseBaseline(readFileSync(baselinePath, 'utf8')).root).toBe('.');

      rmSync(original);
      writeFileSync(moved, 'const width = target.offsetWidth;\n');
      const changed = runCli(
        [
          '--json',
          '--baseline',
          'phase-baseline.json',
          '--fail-on',
          'critical',
          'one',
          'two',
        ],
        root,
      );
      expect(changed.status).toBe(1);
      const json = JSON.parse(changed.stdout);
      expect(json.summary.stale).toBe(null);
      expect(json.findings).toEqual([
        expect.objectContaining({
          baselineState: 'new',
          fingerprint: expect.stringContaining(':two/index.ts:'),
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an explicit baseline from a different scan root', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-baseline-wrong-root-'));
    const one = join(root, 'one');
    const two = join(root, 'two');
    mkdirSync(one);
    mkdirSync(two);
    const content = 'const width = target.offsetWidth;\n';
    writeFileSync(join(one, 'index.ts'), content);
    writeFileSync(join(two, 'index.ts'), content);

    try {
      expect(
        runCli(['--write-baseline', 'phase-baseline.json', '.'], one).status,
      ).toBe(0);
      const run = runCli(
        ['--baseline', 'one/phase-baseline.json', 'two'],
        root,
      );

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('does not match the current scan root');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts equivalent filesystem names for the same scan root', () => {
    if (process.platform !== 'darwin') return;

    const root = mkdtempSync(join(tmpdir(), 'phase-baseline-alias-'));
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    writeFileSync(
      join(workspace, 'finding.ts'),
      'const width = target.offsetWidth;\n',
    );
    const physicalWorkspace = realpathSync(workspace);
    if (physicalWorkspace === workspace) {
      rmSync(root, { recursive: true, force: true });
      return;
    }

    try {
      expect(
        runCli(['--write-baseline', 'phase-baseline.json', '.'], workspace)
          .status,
      ).toBe(0);
      const run = runCli(
        [
          '--baseline',
          join(workspace, 'phase-baseline.json'),
          '--fail-on',
          'critical',
          '.',
        ],
        physicalWorkspace,
      );

      expect(run.status).toBe(0);
      expect(run.stdout).toContain('1 pre-existing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('marks partial stale state unknown and rejects partial baseline writes', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-partial-baseline-'));
    const src = join(root, 'src');
    mkdirSync(src);
    writeFileSync(join(src, 'a.ts'), 'const a = target.offsetWidth;\n');
    writeFileSync(join(src, 'b.ts'), 'const b = target.offsetHeight;\n');

    try {
      expect(
        runCli(['--write-baseline', 'phase-baseline.json', '.'], root).status,
      ).toBe(0);
      const partial = runCli(
        ['--json', '--baseline', 'phase-baseline.json', 'src/a.ts'],
        root,
      );
      expect(partial.status).toBe(0);
      expect(JSON.parse(partial.stdout).summary.stale).toBe(null);

      const write = runCli(
        ['--write-baseline', 'phase-baseline.json', 'src/a.ts'],
        root,
      );
      expect(write.status).toBe(2);
      expect(write.stderr).toContain('exactly one directory target');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['--signal', 'forced-reflow'],
    ['--severity', 'critical'],
    ['--noise', 'precise'],
    ['--exclude', 'styles/'],
  ])('rejects --write-baseline with the %s report filter', (filter, value) => {
    const root = mkdtempSync(join(tmpdir(), 'phase-filtered-baseline-'));
    try {
      const run = runCli([
        '--write-baseline',
        join(root, 'phase-baseline.json'),
        filter,
        value,
        'workspace',
      ]);
      expect(run.status).toBe(2);
      expect(run.stderr).toContain('full unfiltered scan');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects --write-baseline with stdin targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-stdin-baseline-'));
    try {
      const run = runCli([
        '--write-baseline',
        join(root, 'phase-baseline.json'),
        '--stdin0',
      ]);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('full unfiltered scan');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an explicit baseline combined with a baseline write', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-double-baseline-'));
    try {
      const run = runCli([
        '--baseline',
        'missing.json',
        '--write-baseline',
        join(root, 'phase-baseline.json'),
        'workspace',
      ]);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain(
        '--baseline cannot be combined with --write-baseline',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['--baseline', '--write-baseline'])(
    'rejects an empty path for %s',
    (option) => {
      const run = runCli([option, '', 'workspace']);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain(`${option} expects a non-empty path`);
    },
  );

  it('rejects a baseline write when no files were scanned', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-empty-baseline-'));
    try {
      const baseline = join(root, 'phase-baseline.json');
      const run = runCli([
        '--write-baseline',
        baseline,
        join(REPO_ROOT, 'skills/phase/dist'),
      ]);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('no files were scanned');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a baseline write when scan coverage is incomplete', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-incomplete-baseline-'));
    writeFileSync(join(root, 'generated.ts'), 'x'.repeat(1001));
    try {
      const run = runCli(
        ['--write-baseline', 'phase-baseline.json', '.'],
        root,
      );

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('scan coverage is incomplete');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports an unusable baseline write path as a usage error', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-unusable-baseline-'));
    const parentFile = join(root, 'not-a-directory');
    writeFileSync(parentFile, 'file\n');
    try {
      const run = runCli([
        '--write-baseline',
        join(parentFile, 'phase-baseline.json'),
        'workspace',
      ]);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('cannot write baseline');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves the previous baseline when atomic replacement cannot start', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'phase-atomic-baseline-'));
    writeFileSync(join(root, 'finding.ts'), 'const a = target.offsetWidth;\n');
    const baselinePath = join(root, 'phase-baseline.json');
    try {
      expect(
        runCli(['--write-baseline', 'phase-baseline.json', '.'], root).status,
      ).toBe(0);
      const original = readFileSync(baselinePath, 'utf8');
      writeFileSync(join(root, 'new.ts'), 'const b = target.offsetHeight;\n');
      chmodSync(root, 0o555);

      const rewrite = runCli(
        ['--write-baseline', 'phase-baseline.json', '.'],
        root,
      );
      expect(rewrite.status).toBe(2);
      expect(readFileSync(baselinePath, 'utf8')).toBe(original);
    } finally {
      chmodSync(root, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('replaces a corrupt auto-detected baseline', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-repair-baseline-'));
    const src = join(root, 'src');
    mkdirSync(src);
    writeFileSync(
      join(src, 'finding.ts'),
      'const width = target.offsetWidth;\n',
    );
    const baselinePath = join(root, 'phase-baseline.json');
    writeFileSync(baselinePath, '{');

    try {
      const run = runCli(
        ['--write-baseline', 'phase-baseline.json', '.'],
        root,
      );

      expect(run.status).toBe(0);
      expect(
        parseBaseline(readFileSync(baselinePath, 'utf8')).fingerprints,
      ).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to follow an auto-detected baseline symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-symlink-baseline-'));
    const workspace = join(root, 'workspace');
    const src = join(workspace, 'src');
    mkdirSync(workspace);
    mkdirSync(src);
    writeFileSync(
      join(src, 'finding.ts'),
      'const width = target.offsetWidth;\n',
    );
    const fingerprint = assignFingerprints([findingOf('src/finding.ts', 1)])[0]
      ?.fingerprint;
    const outside = join(root, 'outside.json');
    writeFileSync(
      outside,
      serializeBaseline([fingerprint as string], '0.0.45', '.'),
    );
    symlinkSync(outside, join(workspace, 'phase-baseline.json'));

    try {
      const run = runCli(['--fail-on', 'critical', '.'], workspace);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('regular file');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an explicit non-regular baseline without blocking', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(join(tmpdir(), 'phase-fifo-baseline-'));
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    writeFileSync(join(workspace, 'clean.ts'), 'export const clean = true;\n');
    const fifo = join(root, 'baseline.fifo');
    expect(spawnSync('mkfifo', [fifo]).status).toBe(0);

    try {
      const run = spawnSync(
        process.execPath,
        [SCRIPT, '--baseline', fifo, '.'],
        { cwd: workspace, encoding: 'utf8', timeout: 1000 },
      );

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('regular file');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a baseline larger than 16 MiB before parsing', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-large-baseline-'));
    writeFileSync(join(root, 'clean.ts'), 'export const clean = true;\n');
    const baselinePath = join(root, 'phase-baseline.json');
    writeFileSync(baselinePath, '');
    truncateSync(baselinePath, 16 * 1024 * 1024 + 1);

    try {
      const run = runCli(['.'], root);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('exceeds 16 MiB');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to replace a baseline symlink or its target', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-write-symlink-'));
    const workspace = join(root, 'workspace');
    const src = join(workspace, 'src');
    mkdirSync(workspace);
    mkdirSync(src);
    writeFileSync(
      join(src, 'finding.ts'),
      'const width = target.offsetWidth;\n',
    );
    const victim = join(root, 'victim.txt');
    writeFileSync(victim, 'keep me\n');
    const baselinePath = join(workspace, 'phase-baseline.json');
    symlinkSync(victim, baselinePath);

    try {
      const run = runCli(
        ['--write-baseline', 'phase-baseline.json', '.'],
        workspace,
      );

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('regular file');
      expect(readFileSync(victim, 'utf8')).toBe('keep me\n');
      expect(lstatSync(baselinePath).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to follow a dangling baseline symlink while writing', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase-write-dangling-symlink-'));
    const workspace = join(root, 'workspace');
    const src = join(workspace, 'src');
    mkdirSync(workspace);
    mkdirSync(src);
    writeFileSync(
      join(src, 'finding.ts'),
      'const width = target.offsetWidth;\n',
    );
    const victim = join(root, 'created-through-link.json');
    const baselinePath = join(workspace, 'phase-baseline.json');
    symlinkSync(victim, baselinePath);

    try {
      const run = runCli(
        ['--write-baseline', 'phase-baseline.json', '.'],
        workspace,
      );

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('regular file');
      expect(existsSync(victim)).toBe(false);
      expect(lstatSync(baselinePath).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
    const run = runCli(['--json', import.meta.filename]);
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
    expect(run.stdout).toContain('any new finding');
    expect(run.stdout.replace(/\s+/g, ' ')).toContain(
      'without a baseline, all findings are new',
    );
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
