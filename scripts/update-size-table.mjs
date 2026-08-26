import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGE_ROOT = resolve(ROOT, 'packages', 'phase');
const README = resolve(ROOT, 'README.md');

const SIZE_LIMIT_CONFIG = resolve(PACKAGE_ROOT, '.size-limit.json');

const START = '<!-- SIZE-TABLE:START -->';
const END = '<!-- SIZE-TABLE:END -->';

const PATH_TO_GROUP = {
  'src/index.ts': 'Core',
  'src/ease/index.ts': 'Ease',
  'src/react/index.ts': 'React',
};

function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  const kb = bytes / 1000;
  const formatted =
    kb % 1 === 0 ? kb.toFixed(0) : kb.toFixed(2).replace(/0$/, '');
  return `${formatted} kB`;
}

function buildTable(entries, config) {
  const configByName = new Map(config.map((c) => [c.name, c]));

  const groups = new Map();
  for (const entry of entries) {
    const cfg = configByName.get(entry.name);
    const group = cfg ? (PATH_TO_GROUP[cfg.path] ?? 'Other') : 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(entry);
  }

  const rows = ['| Export | Size (min+brotli) |', '| --- | ---: |'];
  for (const label of ['Core', 'Ease', 'React', 'Other']) {
    const items = groups.get(label);
    if (!items) continue;
    rows.push(`| **${label}** | |`);
    for (const e of items)
      rows.push(`| \`${e.name}\` | ${formatBytes(e.size)} |`);
  }

  return rows.join('\n');
}

const config = JSON.parse(readFileSync(SIZE_LIMIT_CONFIG, 'utf8'));
const json = execSync('pnpm exec size-limit --json', {
  cwd: PACKAGE_ROOT,
  encoding: 'utf8',
});
const entries = JSON.parse(json);
const table = buildTable(entries, config);

const readme = readFileSync(README, 'utf8');
const startIdx = readme.indexOf(START);
const endIdx = readme.indexOf(END);

if (startIdx === -1 || endIdx === -1) {
  throw new Error('Missing SIZE-TABLE markers in README.md');
}

const updated = `${readme.slice(0, startIdx + START.length)}
${table}
${readme.slice(endIdx)}`;

writeFileSync(README, updated);
execSync(`pnpm exec oxfmt ${README}`, { cwd: ROOT, stdio: 'inherit' });
console.log('README.md size table updated.');
