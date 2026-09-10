import { basename, extname } from 'node:path';

import type {
  API,
  CallExpression,
  FileInfo,
  MemberExpression,
  Options,
} from 'jscodeshift';

const SPECIFIER_RENAMES = new Map([
  ['phase', '@usephase/core'],
  ['phase/react', '@usephase/react'],
  ['phase/ease', '@usephase/core/ease'],
]);
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;
const RUNTIME_RANGE = '^0.6.0';
const TYPESCRIPT_EXTENSIONS = new Set(['.cts', '.mts', '.ts', '.tsx']);

type StringNode = {
  value?: unknown;
};

function rewriteSpecifier(node: StringNode | null | undefined): boolean {
  if (!node || typeof node.value !== 'string') return false;

  const replacement = SPECIFIER_RENAMES.get(node.value);
  if (!replacement) return false;

  node.value = replacement;
  return true;
}

function isNamedCall(call: CallExpression, name: string): boolean {
  return call.callee.type === 'Identifier' && call.callee.name === name;
}

function isMockCall(call: CallExpression): boolean {
  if (call.callee.type !== 'MemberExpression') return false;

  const callee = call.callee as MemberExpression;
  const object = callee.object;
  const property = callee.property;
  if (
    object.type !== 'Identifier' ||
    (object.name !== 'vi' && object.name !== 'jest')
  ) {
    return false;
  }

  return (
    (callee.computed !== true &&
      property.type === 'Identifier' &&
      property.name === 'mock') ||
    (callee.computed === true &&
      (property.type === 'Literal' || property.type === 'StringLiteral') &&
      property.value === 'mock')
  );
}

function isRequireResolveCall(call: CallExpression): boolean {
  if (call.callee.type !== 'MemberExpression') return false;

  const callee = call.callee as MemberExpression;
  const object = callee.object;
  const property = callee.property;
  return (
    object.type === 'Identifier' &&
    object.name === 'require' &&
    ((callee.computed !== true &&
      property.type === 'Identifier' &&
      property.name === 'resolve') ||
      (callee.computed === true &&
        (property.type === 'Literal' || property.type === 'StringLiteral') &&
        property.value === 'resolve'))
  );
}

function callSpecifier(call: CallExpression): StringNode | undefined {
  if (
    call.callee.type !== 'Import' &&
    !isNamedCall(call, 'require') &&
    !isRequireResolveCall(call) &&
    !isMockCall(call)
  ) {
    return undefined;
  }

  const [specifier] = call.arguments;
  return specifier?.type === 'Literal' || specifier?.type === 'StringLiteral'
    ? specifier
    : undefined;
}

function transformPackageJson(source: string): string | undefined {
  const manifest = JSON.parse(source) as Record<string, unknown>;
  let changed = false;

  for (const sectionName of DEPENDENCY_SECTIONS) {
    const section = manifest[sectionName];
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      continue;
    }

    const dependencies = section as Record<string, unknown>;
    if (!Object.hasOwn(dependencies, 'phase')) continue;

    delete dependencies.phase;
    dependencies['@usephase/core'] ??= RUNTIME_RANGE;
    dependencies['@usephase/react'] ??= RUNTIME_RANGE;
    changed = true;
  }

  const peerMetadata = manifest.peerDependenciesMeta;
  if (
    peerMetadata &&
    typeof peerMetadata === 'object' &&
    !Array.isArray(peerMetadata)
  ) {
    const metadata = peerMetadata as Record<string, unknown>;
    if (Object.hasOwn(metadata, 'phase')) {
      const legacyMetadata = metadata.phase;
      delete metadata.phase;
      metadata['@usephase/core'] ??= legacyMetadata;
      metadata['@usephase/react'] ??= legacyMetadata;
      changed = true;
    }
  }

  if (!changed) return undefined;

  const indentation = source.match(/\n([\t ]+)"/)?.[1] ?? '  ';
  const trailingNewline = source.endsWith('\n') ? '\n' : '';
  return `${JSON.stringify(manifest, null, indentation)}${trailingNewline}`;
}

function transformSource(file: FileInfo, api: API): string | undefined {
  const extension = extname(file.path);
  const parser =
    extension === '.tsx'
      ? 'tsx'
      : TYPESCRIPT_EXTENSIONS.has(extension)
        ? 'ts'
        : 'babel';
  const j = api.jscodeshift.withParser(parser);
  const root = j(file.source);
  let changed = false;

  for (const declaration of root.find(j.ImportDeclaration).nodes()) {
    changed = rewriteSpecifier(declaration.source) || changed;
  }
  for (const declaration of root.find(j.ExportNamedDeclaration).nodes()) {
    changed = rewriteSpecifier(declaration.source) || changed;
  }
  for (const declaration of root.find(j.ExportAllDeclaration).nodes()) {
    changed = rewriteSpecifier(declaration.source) || changed;
  }
  for (const declaration of root.find(j.TSImportEqualsDeclaration).nodes()) {
    if (declaration.moduleReference.type !== 'TSExternalModuleReference') {
      continue;
    }
    changed =
      rewriteSpecifier(declaration.moduleReference.expression) || changed;
  }
  for (const call of root.find(j.CallExpression).nodes()) {
    changed = rewriteSpecifier(callSpecifier(call)) || changed;
  }

  return changed ? root.toSource({ quote: 'single' }) : undefined;
}

export default function transform(
  file: FileInfo,
  api: API,
  _options: Options,
): string | undefined {
  if (basename(file.path) === 'package.json') {
    return transformPackageJson(file.source);
  }
  return transformSource(file, api);
}
