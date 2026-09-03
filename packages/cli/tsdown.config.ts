import { readFileSync } from 'node:fs';

import { defineConfig } from 'tsdown';

function readVersion(path: URL): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    version?: unknown;
  };
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`${path.pathname} does not declare a version`);
  }
  return manifest.version;
}

const packageVersion = readVersion(new URL('package.json', import.meta.url));
const scannerVersion = readVersion(
  new URL('../../skills/phase/metadata.json', import.meta.url),
);

export default defineConfig({
  clean: true,
  cwd: import.meta.dirname,
  define: {
    __PHASE_COMMAND__: JSON.stringify('phase'),
    __PHASE_PACKAGE_VERSION__: JSON.stringify(packageVersion),
    __PHASE_SCANNER_VERSION__: JSON.stringify(scannerVersion),
  },
  dts: false,
  entry: { phase: '../skill/scanner/cli.ts' },
  fixedExtension: true,
  format: ['esm'],
  platform: 'node',
  sourcemap: false,
  target: 'node20',
});
