import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const README = resolve(ROOT, 'README.md');
const PACKAGES = [
  {
    root: resolve(ROOT, 'packages', 'core'),
    group(path) {
      return path === 'src/ease/index.ts' ? 'Ease' : 'Core';
    },
  },
  {
    root: resolve(ROOT, 'packages', 'react'),
    group() {
      return 'React';
    },
  },
];

const START = '<!-- SIZE-TABLE:START -->';
const END = '<!-- SIZE-TABLE:END -->';

function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  const kb = bytes / 1000;
  const formatted =
    kb % 1 === 0 ? kb.toFixed(0) : kb.toFixed(2).replace(/0$/, '');
  return `${formatted} kB`;
}

function buildTable(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const group = entry.group;
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

const entries = PACKAGES.flatMap(({ root, group }) => {
  const config = JSON.parse(
    readFileSync(resolve(root, '.size-limit.json'), 'utf8'),
  );
  const configByName = new Map(config.map((entry) => [entry.name, entry]));
  const json = execSync('pnpm exec size-limit --json', {
    cwd: root,
    encoding: 'utf8',
  });
  return JSON.parse(json).map((entry) => {
    entry.group = group(configByName.get(entry.name)?.path);
    return entry;
  });
});
const table = buildTable(entries);

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
