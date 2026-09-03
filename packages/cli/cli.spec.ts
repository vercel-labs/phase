import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { consumerArtifactImportErrors } from '../skill/scripts/skill/distribution.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const CLI_ROOT = join(REPO_ROOT, 'packages/cli');
const CLI_SCRIPT = join(CLI_ROOT, 'dist/phase.mjs');
const SKILL_SCRIPT = join(REPO_ROOT, 'skills/phase/scripts/scan.mjs');
const FIXTURE =
  'packages/skill/evals/scenarios/audit-planted-defects/workspace/src/hero-animation.tsx';
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function run(script: string, args: string[], cwd = REPO_ROOT) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

describe('phase command distribution', () => {
  it('prints usage and scan examples when invoked without arguments', () => {
    const result = run(CLI_SCRIPT, []);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: phase');
    expect(result.stdout).toContain('phase scan --diff origin/main');
    expect(result.stdout).toContain('phase scan <path>');
    expect(result.stdout.indexOf('Start with')).toBeLessThan(
      result.stdout.indexOf('Options'),
    );
  });

  it('scans the current directory when the scan command has no target', () => {
    const directory = mkdtempSync(join(tmpdir(), 'phase-cli-scan-'));
    temporaryDirectories.push(directory);
    writeFileSync(
      join(directory, 'animation.tsx'),
      'requestAnimationFrame(() => setState(1));\n',
    );

    const result = run(CLI_SCRIPT, ['scan', '--json'], directory);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).summary.filesScanned).toBe(1);
  });

  it('produces the same scan output as the installable skill', () => {
    const cli = run(CLI_SCRIPT, ['scan', '--json', FIXTURE]);
    const skill = run(SKILL_SCRIPT, ['--json', FIXTURE]);

    expect(cli.status).toBe(0);
    expect(cli.stderr).toBe(skill.stderr);
    expect(cli.stdout).toBe(skill.stdout);
  });

  it('produces the same explanation output as the installable skill', () => {
    const cli = run(CLI_SCRIPT, ['explain', 'setstate-in-raf']);
    const skill = run(SKILL_SCRIPT, ['explain', 'setstate-in-raf']);

    expect(cli.status).toBe(0);
    expect(cli.stderr).toBe(skill.stderr);
    expect(cli.stdout).toBe(skill.stdout);
  });

  it('reports package and scanner versions separately', () => {
    const packageVersion = JSON.parse(
      readFileSync(join(CLI_ROOT, 'package.json'), 'utf8'),
    ).version;
    const scannerVersion = JSON.parse(
      readFileSync(join(REPO_ROOT, 'skills/phase/metadata.json'), 'utf8'),
    ).version;

    expect(run(CLI_SCRIPT, ['--version']).stdout.trim()).toBe(
      `phase ${packageVersion} (scanner ${scannerVersion})`,
    );
    expect(run(SKILL_SCRIPT, ['--version']).stdout.trim()).toBe(
      `scan.mjs (scanner ${scannerVersion})`,
    );
  });

  it('imports only Node.js built-ins', () => {
    expect(
      consumerArtifactImportErrors(
        readFileSync(CLI_SCRIPT, 'utf8'),
        'phase.mjs',
      ),
    ).toEqual([]);
  });

  it('does not expose a programmatic API', async () => {
    const command = await import(pathToFileURL(CLI_SCRIPT).href);

    expect(Object.keys(command)).toEqual([]);
  });

  it('runs the packed command after installing it in a consumer directory', () => {
    const packed = mkdtempSync(join(tmpdir(), 'phase-cli-pack-'));
    const consumer = mkdtempSync(join(tmpdir(), 'phase-cli-consumer-'));
    temporaryDirectories.push(packed, consumer);
    writeFileSync(join(consumer, 'package.json'), '{"private":true}\n');

    const pack = spawnSync(
      'npm',
      ['pack', '--pack-destination', packed, '--silent'],
      { cwd: CLI_ROOT, encoding: 'utf8' },
    );
    expect(pack.status, pack.stderr).toBe(0);

    const archive = join(
      packed,
      readdirSync(packed).find((entry) => entry.endsWith('.tgz')) as string,
    );
    const install = spawnSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        '--no-save',
        archive,
      ],
      { cwd: consumer, encoding: 'utf8' },
    );
    expect(install.status, install.stderr).toBe(0);

    const installedCommand = join(consumer, 'node_modules/.bin/phase');
    const help = spawnSync(installedCommand, ['--help'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('Usage: phase');

    writeFileSync(
      join(consumer, 'animation.tsx'),
      readFileSync(join(REPO_ROOT, FIXTURE), 'utf8'),
    );
    const scan = spawnSync(installedCommand, ['scan', 'animation.tsx'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    expect(scan.status, scan.stderr).toBe(0);
    expect(scan.stdout).toContain(
      'read: https://github.com/vercel-labs/phase/blob/main/skills/phase/references/',
    );
    expect(scan.stdout).not.toMatch(/(?:read: |\()references\//);
  });
});
