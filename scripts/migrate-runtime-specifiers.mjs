import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

function main() {
  const mode = process.argv[2];
  if (mode !== '--check' && mode !== '--write') {
    console.error(
      'Usage: node scripts/migrate-runtime-specifiers.mjs --check|--write',
    );
    return 2;
  }

  const root = process.cwd();
  const targetFiles = ['README.md', 'skills/phase/SKILL.md'];
  const targetDirectories = [
    'packages/examples',
    'packages/skill/evals',
    'skills/phase/references',
  ];
  const sourceExtensions = new Set([
    '.js',
    '.jsx',
    '.md',
    '.mjs',
    '.ts',
    '.tsx',
  ]);
  const mappings = [
    ['phase/react', '@usephase/react'],
    ['phase/ease', '@usephase/core/ease'],
    ['phase', '@usephase/core'],
  ];
  const legacyAllowlist = new Map([
    ['packages/skill/scanner/__tests__/analysis.spec.ts', 1],
    ['packages/skill/scanner/__tests__/engine.spec.ts', 6],
    ['packages/skill/scanner/examples.ts', 66],
    ['scripts/migrate-runtime-specifiers.spec.mjs', 5],
  ]);
  const legacyConfiguration = new Map([
    ['.github/workflows/ci.yml', /--filter\s+phase\b/],
    ['.github/workflows/release.yml', /--filter\s+phase\b/],
    ['.github/workflows/size.yml', /--filter\s+phase\b/],
    ['packages/examples/package.json', /"phase"\s*:\s*"workspace:/],
    ['turbo.json', /phase#build/],
  ]);

  function collect(directory, files) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        collect(path, files);
      } else if (sourceExtensions.has(extname(entry.name))) {
        files.push(path);
      }
    }
  }

  function collectRepositoryFiles(directory, files) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        ['.git', 'dist', 'node_modules'].includes(entry.name)
      ) {
        continue;
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        collectRepositoryFiles(path, files);
      } else if (sourceExtensions.has(extname(entry.name))) {
        files.push(path);
      }
    }
  }

  function verifyLegacyImports() {
    const repositoryFiles = [];
    collectRepositoryFiles(root, repositoryFiles);
    let clean = true;
    for (const file of repositoryFiles) {
      const path = relative(root, file);
      if (path === 'skills/phase/scripts/scan.mjs') continue;
      const content = readFileSync(file, 'utf8');
      const count = [
        ...content.matchAll(
          /(?:\bfrom\s*|\bimport\s+|\bimport\s*\(\s*)(['"])(phase(?:\/react|\/ease)?)\1/g,
        ),
      ].length;
      const expected = legacyAllowlist.get(path) ?? 0;
      if (count === expected) continue;
      clean = false;
      console.error(
        expected === 0
          ? `Unexpected legacy runtime import in ${path}`
          : `Legacy runtime import count changed in ${path}: expected ${expected}, received ${count}`,
      );
    }
    for (const [path, pattern] of legacyConfiguration) {
      const file = join(root, path);
      if (!existsSync(file) || !pattern.test(readFileSync(file, 'utf8'))) {
        continue;
      }
      clean = false;
      console.error(`Legacy package configuration in ${path}`);
    }
    return clean;
  }

  const files = targetFiles
    .map((path) => join(root, path))
    .filter((path) => existsSync(path));
  for (const directory of targetDirectories) {
    collect(join(root, directory), files);
  }
  files.sort((left, right) =>
    relative(root, left).localeCompare(relative(root, right)),
  );

  let replacementCount = 0;
  const changes = [];
  const unknownSpecifiers = new Set();
  for (const file of files) {
    const original = readFileSync(file, 'utf8');
    for (const match of original.matchAll(
      /(?:\bfrom\s*|\bimport\s+|\bimport\s*\(\s*)(['"])(phase\/[^'"]+)\1/g,
    )) {
      if (!mappings.some(([from]) => from === match[2])) {
        unknownSpecifiers.add(match[2]);
      }
    }

    let next = original;
    let fileCount = 0;
    for (const [from, to] of mappings) {
      const escaped = from.replace('/', '\\/');
      const patterns = [
        new RegExp(`(\\bfrom\\s*)(['"])${escaped}\\2`, 'g'),
        new RegExp(`(\\bimport\\s+)(['"])${escaped}\\2`, 'g'),
        new RegExp(`(\\bimport\\s*\\(\\s*)(['"])${escaped}\\2`, 'g'),
      ];
      for (const pattern of patterns) {
        next = next.replace(pattern, (_specifier, prefix, quote) => {
          fileCount += 1;
          return `${prefix}${quote}${to}${quote}`;
        });
      }
    }
    if (next !== original) {
      replacementCount += fileCount;
      changes.push({ file, content: next });
    }
  }

  for (const specifier of [...unknownSpecifiers].toSorted()) {
    console.error(`Unclassified runtime specifier: ${specifier}`);
  }

  if (mode === '--check') {
    if (replacementCount === 0 && unknownSpecifiers.size === 0) {
      if (verifyLegacyImports()) {
        console.log('Runtime specifiers are current');
        return 0;
      }
      return 1;
    }
    console.log(`${replacementCount} runtime specifiers need migration`);
    return 1;
  }

  if (unknownSpecifiers.size > 0) return 2;
  for (const { file, content } of changes) writeFileSync(file, content);
  if (!verifyLegacyImports()) return 1;
  console.log(`Migrated ${replacementCount} runtime specifiers`);
  return 0;
}

process.exitCode = main();
