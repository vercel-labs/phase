import { basename, extname } from 'node:path';

import jscodeshift, {
  type ASTPath,
  type CallExpression,
  type Collection,
  type JSCodeshift,
} from 'jscodeshift';

const RUNTIME_DEPENDENCIES = ['@usephase/core', '@usephase/react'] as const;

export type RuntimeDependency = (typeof RUNTIME_DEPENDENCIES)[number];

type RenameImportsInput = {
  path: string;
  source: string;
  preserveLegacyDependency?: boolean;
  requiredDependencies?: readonly RuntimeDependency[];
};

type RenameImportsResult = {
  content: string;
  requiredDependencies: RuntimeDependency[];
  unresolvedSpecifiers: string[];
};

type BindingRegistry = Map<string, Set<unknown>>;

type SpecifierNode = {
  type?: string;
  value?: unknown;
  expressions?: unknown[];
  quasis?: Array<{
    value: { cooked?: string | null; raw: string };
  }>;
};

const SPECIFIER_POLICIES = new Map<
  string,
  { dependency: RuntimeDependency; replacement?: string }
>([
  ['phase', { dependency: '@usephase/core', replacement: '@usephase/core' }],
  [
    'phase/ease',
    { dependency: '@usephase/core', replacement: '@usephase/core/ease' },
  ],
  [
    'phase/react',
    { dependency: '@usephase/react', replacement: '@usephase/react' },
  ],
  ['@usephase/core', { dependency: '@usephase/core' }],
  ['@usephase/core/ease', { dependency: '@usephase/core' }],
  ['@usephase/react', { dependency: '@usephase/react' }],
]);
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;
const BUNDLED_DEPENDENCY_SECTIONS = [
  'bundleDependencies',
  'bundledDependencies',
] as const;
const ADDED_RUNTIME_DEPENDENCY_RANGE = '^0.6.0';
const TYPESCRIPT_EXTENSIONS = new Set(['.cts', '.mts', '.ts', '.tsx']);

function specifierValue(node: SpecifierNode | null | undefined) {
  if (!node) return undefined;
  if (typeof node.value === 'string') return node.value;
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions?.length === 0 &&
    node.quasis?.length === 1
  ) {
    return node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw;
  }
  return undefined;
}

function rewriteModuleSpecifier(
  node: SpecifierNode | null | undefined,
  requiredDependencies: Set<RuntimeDependency>,
  unresolvedSpecifiers: Set<string>,
): boolean {
  const value = specifierValue(node);
  if (!value || !node) return false;

  const policy = SPECIFIER_POLICIES.get(value);
  if (!policy) {
    if (value.startsWith('phase/')) unresolvedSpecifiers.add(value);
    return false;
  }
  requiredDependencies.add(policy.dependency);
  const { replacement } = policy;
  if (!replacement) return false;

  if (node.type === 'TemplateLiteral' && node.quasis?.length === 1) {
    const [quasi] = node.quasis;
    if (!quasi) return false;
    quasi.value.cooked = replacement;
    quasi.value.raw = replacement;
  } else {
    node.value = replacement;
  }
  return true;
}

function memberPropertyIs(
  member: Extract<CallExpression['callee'], { type: 'MemberExpression' }>,
  name: string,
): boolean {
  const property = member.property;
  return (
    (member.computed !== true &&
      property.type === 'Identifier' &&
      property.name === name) ||
    (member.computed === true &&
      (property.type === 'Literal' || property.type === 'StringLiteral') &&
      property.value === name)
  );
}

function addBinding(bindings: BindingRegistry, name: string, binding: unknown) {
  const registered = bindings.get(name) ?? new Set();
  registered.add(binding);
  bindings.set(name, registered);
}

function recordImportBindings(
  root: Collection,
  j: JSCodeshift,
): {
  createRequire: BindingRegistry;
  mocks: BindingRegistry;
} {
  const createRequire: BindingRegistry = new Map();
  const mocks: BindingRegistry = new Map();

  for (const path of root.find(j.ImportDeclaration).paths()) {
    const source = specifierValue(path.node.source);
    for (const specifier of path.node.specifiers ?? []) {
      if (specifier.type !== 'ImportSpecifier') continue;
      const importedNode = specifier.imported;
      const imported =
        typeof importedNode === 'string'
          ? importedNode
          : importedNode.type === 'Identifier'
            ? importedNode.name
            : undefined;
      if (typeof imported !== 'string') continue;
      const local =
        specifier.local?.type === 'Identifier'
          ? specifier.local.name
          : imported;
      const binding = path.scope.lookup(local);
      if (!binding) continue;

      if (
        imported === 'createRequire' &&
        (source === 'node:module' || source === 'module')
      ) {
        addBinding(createRequire, local, binding);
      }
      if (
        (imported === 'vi' && source === 'vitest') ||
        (imported === 'jest' && source === '@jest/globals')
      ) {
        addBinding(mocks, local, binding);
      }
    }
  }

  return { createRequire, mocks };
}

function recordCreateRequireBindings(
  root: Collection,
  j: JSCodeshift,
  createRequireImports: BindingRegistry,
) {
  const bindings: BindingRegistry = new Map();
  for (const path of root.find(j.VariableDeclarator).paths()) {
    const declaration = path.node;
    if (
      declaration.id.type !== 'Identifier' ||
      declaration.id.name !== 'require' ||
      declaration.init?.type !== 'CallExpression' ||
      declaration.init.callee.type !== 'Identifier'
    ) {
      continue;
    }

    const createRequireName = declaration.init.callee.name;
    if (
      !createRequireImports
        .get(createRequireName)
        ?.has(path.scope.lookup(createRequireName))
    ) {
      continue;
    }
    const binding = path.scope.lookup('require');
    if (binding) {
      const registered = bindings.get('require') ?? new Set();
      registered.add(binding);
      bindings.set('require', registered);
    }
  }
  return bindings;
}

function isRecognizedBinding(
  path: ASTPath<CallExpression>,
  name: string,
  bindings: BindingRegistry,
  allowGlobal: boolean,
) {
  const binding = path.scope.lookup(name);
  return (allowGlobal && !binding) || Boolean(bindings.get(name)?.has(binding));
}

function moduleSpecifierFromSupportedCall(
  path: ASTPath<CallExpression>,
  requireBindings: BindingRegistry,
  mockBindings: BindingRegistry,
): SpecifierNode | undefined {
  const call = path.node;
  let supported = call.callee.type === 'Import';

  if (call.callee.type === 'Identifier' && call.callee.name === 'require') {
    supported = isRecognizedBinding(path, 'require', requireBindings, true);
  }
  if (
    call.callee.type === 'MemberExpression' &&
    call.callee.object.type === 'Identifier'
  ) {
    const objectName = call.callee.object.name;
    if (objectName === 'require' && memberPropertyIs(call.callee, 'resolve')) {
      supported = isRecognizedBinding(path, 'require', requireBindings, true);
    } else if (memberPropertyIs(call.callee, 'mock')) {
      supported = isRecognizedBinding(
        path,
        objectName,
        mockBindings,
        objectName === 'vi' || objectName === 'jest',
      );
    }
  }
  if (!supported) return undefined;

  const [specifier] = call.arguments;
  if (
    specifier?.type !== 'Literal' &&
    specifier?.type !== 'StringLiteral' &&
    specifier?.type !== 'TemplateLiteral'
  ) {
    return undefined;
  }
  return specifier;
}

function runtimeDependencies(
  dependencies: Iterable<RuntimeDependency>,
): RuntimeDependency[] {
  const selected = new Set(dependencies);
  return RUNTIME_DEPENDENCIES.filter((dependency) => selected.has(dependency));
}

function migrateBundledDependencies(
  manifest: Record<string, unknown>,
  requiredDependencies: readonly RuntimeDependency[],
  preserveLegacyDependency: boolean,
) {
  let changed = false;
  for (const sectionName of BUNDLED_DEPENDENCY_SECTIONS) {
    const section = manifest[sectionName];
    if (!Array.isArray(section) || !section.includes('phase')) continue;

    const next: unknown[] = [];
    for (const dependency of section) {
      const replacements =
        dependency === 'phase'
          ? [
              ...(preserveLegacyDependency ? ['phase'] : []),
              ...requiredDependencies,
            ]
          : [dependency];
      for (const replacement of replacements) {
        if (!next.includes(replacement)) next.push(replacement);
      }
    }
    manifest[sectionName] = next;
    changed = true;
  }
  return changed;
}

function migrateDependencySections(
  manifest: Record<string, unknown>,
  requiredDependencies: readonly RuntimeDependency[],
  preserveLegacyDependency: boolean,
) {
  let changed = false;
  for (const sectionName of DEPENDENCY_SECTIONS) {
    const section = manifest[sectionName];
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      continue;
    }

    const dependencies = section as Record<string, unknown>;
    if (!Object.hasOwn(dependencies, 'phase')) continue;

    if (!preserveLegacyDependency) delete dependencies.phase;
    for (const dependency of requiredDependencies) {
      dependencies[dependency] ??= ADDED_RUNTIME_DEPENDENCY_RANGE;
    }
    changed = true;
  }
  return changed;
}

function migratePeerMetadata(
  manifest: Record<string, unknown>,
  requiredDependencies: readonly RuntimeDependency[],
  preserveLegacyDependency: boolean,
) {
  const section = manifest.peerDependenciesMeta;
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    return false;
  }

  const metadata = section as Record<string, unknown>;
  if (!Object.hasOwn(metadata, 'phase')) return false;

  const legacyMetadata = metadata.phase;
  if (!preserveLegacyDependency) delete metadata.phase;
  for (const dependency of requiredDependencies) {
    metadata[dependency] ??= legacyMetadata;
  }
  return true;
}

function transformPackageJson(
  source: string,
  requestedDependencies: readonly RuntimeDependency[] | undefined,
  preserveLegacyDependency: boolean,
): string {
  const byteOrderMark = source.startsWith('\uFEFF') ? '\uFEFF' : '';
  const json = byteOrderMark ? source.slice(1) : source;
  const manifest = JSON.parse(json) as Record<string, unknown>;
  const hasObservedDependencies = Boolean(requestedDependencies?.length);
  const requiredDependencies = runtimeDependencies(
    hasObservedDependencies
      ? (requestedDependencies ?? RUNTIME_DEPENDENCIES)
      : RUNTIME_DEPENDENCIES,
  );
  const retainLegacyDependency =
    preserveLegacyDependency || !hasObservedDependencies;
  const changed = [
    migrateDependencySections(
      manifest,
      requiredDependencies,
      retainLegacyDependency,
    ),
    migratePeerMetadata(manifest, requiredDependencies, retainLegacyDependency),
    migrateBundledDependencies(
      manifest,
      requiredDependencies,
      retainLegacyDependency,
    ),
  ].some(Boolean);
  if (!changed) return source;

  const lineTerminator = json.includes('\r\n') ? '\r\n' : '\n';
  const indentation = json.match(/\n([\t ]+)"/)?.[1] ?? '  ';
  const trailingNewline = json.endsWith(lineTerminator) ? lineTerminator : '';
  const content = JSON.stringify(manifest, null, indentation).replaceAll(
    '\n',
    lineTerminator,
  );
  return `${byteOrderMark}${content}${trailingNewline}`;
}

function parserFor(path: string) {
  const extension = extname(path);
  if (extension === '.js' || extension === '.jsx') return 'flow';
  if (extension === '.tsx') return 'tsx';
  return TYPESCRIPT_EXTENSIONS.has(extension) ? 'ts' : 'babel';
}

function transformSource(path: string, source: string): RenameImportsResult {
  const j = jscodeshift.withParser(parserFor(path));
  const root = j(source);
  const requiredDependencies = new Set<RuntimeDependency>();
  const unresolvedSpecifiers = new Set<string>();
  const importedBindings = recordImportBindings(root, j);
  const requireBindings = recordCreateRequireBindings(
    root,
    j,
    importedBindings.createRequire,
  );
  let changed = false;

  for (const declaration of root.find(j.ImportDeclaration).nodes()) {
    changed =
      rewriteModuleSpecifier(
        declaration.source,
        requiredDependencies,
        unresolvedSpecifiers,
      ) || changed;
  }
  for (const declaration of root.find(j.ExportNamedDeclaration).nodes()) {
    changed =
      rewriteModuleSpecifier(
        declaration.source,
        requiredDependencies,
        unresolvedSpecifiers,
      ) || changed;
  }
  for (const declaration of root.find(j.ExportAllDeclaration).nodes()) {
    changed =
      rewriteModuleSpecifier(
        declaration.source,
        requiredDependencies,
        unresolvedSpecifiers,
      ) || changed;
  }
  for (const declaration of root.find(j.TSImportEqualsDeclaration).nodes()) {
    if (declaration.moduleReference.type !== 'TSExternalModuleReference') {
      continue;
    }
    changed =
      rewriteModuleSpecifier(
        declaration.moduleReference.expression,
        requiredDependencies,
        unresolvedSpecifiers,
      ) || changed;
  }
  for (const importType of root.find(j.TSImportType).nodes()) {
    changed =
      rewriteModuleSpecifier(
        importType.argument,
        requiredDependencies,
        unresolvedSpecifiers,
      ) || changed;
  }
  for (const callPath of root.find(j.CallExpression).paths()) {
    changed =
      rewriteModuleSpecifier(
        moduleSpecifierFromSupportedCall(
          callPath,
          requireBindings,
          importedBindings.mocks,
        ),
        requiredDependencies,
        unresolvedSpecifiers,
      ) || changed;
  }

  const lineTerminator = source.includes('\r\n') ? '\r\n' : '\n';
  return {
    content: changed
      ? root.toSource({ lineTerminator, quote: 'single' })
      : source,
    requiredDependencies: runtimeDependencies(requiredDependencies),
    unresolvedSpecifiers: [...unresolvedSpecifiers].toSorted(),
  };
}

export default function renameImports({
  path,
  source,
  preserveLegacyDependency = false,
  requiredDependencies,
}: RenameImportsInput): RenameImportsResult {
  if (basename(path) === 'package.json') {
    return {
      content: transformPackageJson(
        source,
        requiredDependencies,
        preserveLegacyDependency,
      ),
      requiredDependencies: [],
      unresolvedSpecifiers: [],
    };
  }
  return transformSource(path, source);
}
