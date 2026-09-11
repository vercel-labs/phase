import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const README = new URL('../README.md', import.meta.url);
const CATALOG = new URL('../codemods.json', import.meta.url);
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const START = '<!-- CODEMOD-TABLE:START -->';
const END = '<!-- CODEMOD-TABLE:END -->';

function codeList(values) {
  return values.map((value) => `\`${value}\``).join('<br>');
}

function tableCell(value) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderTable(codemods) {
  const rows = [
    '| Codemod | From | To | Purpose |',
    '| --- | --- | --- | --- |',
  ];
  for (const codemod of codemods) {
    if (
      typeof codemod.name !== 'string' ||
      !Array.isArray(codemod.from) ||
      !Array.isArray(codemod.to) ||
      typeof codemod.summary !== 'string' ||
      typeof codemod.docs !== 'string'
    ) {
      throw new Error('codemods.json contains an invalid entry');
    }
    rows.push(
      `| [\`${tableCell(codemod.name)}\`](${tableCell(codemod.docs)}) | ${codeList(codemod.from)} | ${codeList(codemod.to)} | ${tableCell(codemod.summary)} |`,
    );
  }
  return rows.join('\n');
}

function updateGeneratedTable(readme, table) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (
    start === -1 ||
    end === -1 ||
    end < start ||
    readme.indexOf(START, start + START.length) !== -1 ||
    readme.indexOf(END, end + END.length) !== -1
  ) {
    throw new Error('README.md must contain one ordered codemod table region');
  }
  return `${readme.slice(0, start)}${START}\n${table}\n${END}${readme.slice(end + END.length)}`;
}

function formatReadme(readme) {
  return execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'oxfmt', '--stdin-filepath', fileURLToPath(README)],
    { cwd: ROOT, encoding: 'utf8', input: readme },
  );
}

const mode = process.argv[2];
if (mode !== '--check' && mode !== '--write') {
  console.error('Usage: node scripts/generate-readme.mjs --check|--write');
  process.exitCode = 2;
} else {
  const readme = readFileSync(README, 'utf8');
  const codemods = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const updated = formatReadme(
    updateGeneratedTable(readme, renderTable(codemods)),
  );

  if (mode === '--write') {
    writeFileSync(README, updated);
    console.log('Updated the codemod table in README.md');
  } else if (updated !== readme) {
    console.error(
      'The codemod table is stale. Run pnpm --filter @usephase/codemod readme:fix.',
    );
    process.exitCode = 1;
  }
}
