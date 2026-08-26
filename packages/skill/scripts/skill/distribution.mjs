import { isBuiltin } from 'node:module';

import { init, parse } from 'es-module-lexer';

await init;

export function scannerImportErrors(source) {
  const errors = [];
  const [imports] = parse(source);

  for (const entry of imports) {
    if (entry.d >= 0) {
      errors.push('scan.mjs contains a dynamic import() call');
      continue;
    }
    if (entry.d === -2) continue;

    const specifier = entry.n;
    if (
      specifier === undefined ||
      !specifier.startsWith('node:') ||
      !isBuiltin(specifier)
    ) {
      errors.push(`scan.mjs imports non-builtin module: ${specifier}`);
    }
  }

  if (/\brequire\s*\(/.test(source)) {
    errors.push('scan.mjs contains a CommonJS require() call');
  }
  return errors;
}
