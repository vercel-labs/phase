import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { FINDING_IDENTITY_FILE } from './baseline.ts';
import {
  detectAppRouterRoot,
  detectProjectRoot,
  updateContext,
} from './context.ts';
import type { ScanContext } from './context.ts';
import { newDiag, scanFile } from './detect.ts';
import type { ScanFinding } from './detect.ts';
import type { UnbaselinedScanResult } from './render.ts';
import {
  EXCLUDED_PATHS,
  SKIP_FILES,
  toPathMatcher,
  toPosix,
  walk,
} from './walk.ts';

export interface ScanOptions {
  exclude?: string[];
  /**
   * Existing root used for canonical fingerprint paths and physical-target
   * deduplication. Relative values resolve from the process working directory;
   * omit it to use display paths and lexical target identity.
   */
  root?: string;
}

interface ProjectRoots {
  projectRoot: string | null;
  appRouterRoot: string | null;
}

/**
 * Scans one or more directories or files. Returns all findings plus scan
 * metadata. Paths inside a target are reported relative to that target, while
 * `options.root` can provide one root for stable fingerprint identity.
 */
export function scanTargets(
  paths: string[],
  options: ScanOptions = {},
): UnbaselinedScanResult {
  const findings: ScanFinding[] = [];
  const diag = newDiag();
  const context: ScanContext = {
    framework: null,
    appRouter: false,
    ppr: false,
    clientComponents: 0,
    evidence: [],
  };
  const excluded = (options.exclude ?? []).map(toPathMatcher);
  const identityRoot =
    options.root === undefined ? null : realpathSync(resolve(options.root));
  // Overlapping targets (`scan.mjs src src/components`) would otherwise
  // report the same file twice and double every count.
  const seen = new Set<string>();
  const projectRoots = new Map<string, ProjectRoots>();

  for (const target of paths) {
    const root = resolve(target);
    const stat = lstatSync(root);
    const canonicalTarget = canonicalTargetPath(root, identityRoot);
    const base = stat.isDirectory() ? root : dirname(root);
    const files = stat.isDirectory() ? walk(root, diag) : [root];

    // Also for file targets: `git diff --name-only | xargs scan.mjs` is the
    // workflow most likely to run against a Next.js app, and it is exactly
    // where a missing context stamp would hide the blast-radius warning.
    const configRoot = stat.isDirectory() ? root : base;
    if (!projectRoots.has(configRoot)) {
      const projectRoot = detectProjectRoot(configRoot, context);
      // Router layout is resolved from the project root, not the target, so a
      // nested target keeps the context its project actually has.
      projectRoots.set(configRoot, {
        projectRoot,
        appRouterRoot: detectAppRouterRoot(projectRoot ?? configRoot),
      });
    }
    const roots = projectRoots.get(configRoot) as ProjectRoots;
    const { projectRoot, appRouterRoot } = roots;

    for (const filePath of files) {
      const identityPath = findingIdentityPath(
        filePath,
        root,
        canonicalTarget,
        stat.isDirectory(),
        identityRoot,
      );
      if (seen.has(identityPath)) continue;
      seen.add(identityPath);

      // File targets keep the path as the caller gave it, so directory-based
      // exclusions (__tests__, node_modules) still apply in diff-scoped scans.
      const rel = stat.isDirectory()
        ? toPosix(relative(base, filePath))
        : toPosix(target).replace(/^\.\//, '');

      // The walker already applies these; a file target bypasses it, and a
      // generated .d.ts or .min.js in a diff should be skipped either way.
      if (SKIP_FILES.test(rel)) {
        diag.skipped.generated++;
        continue;
      }

      if (excluded.some((matches) => matches(rel))) {
        diag.skipped.excluded++;
        continue;
      }

      let content;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        diag.skipped.unreadable++;
        continue;
      }

      // Excluded paths (tests, fixtures, agent config) must not poison
      // environment detection either.
      if (!EXCLUDED_PATHS.test(rel)) {
        const contextRel = projectRoot
          ? toPosix(relative(projectRoot, filePath))
          : rel;
        updateContext(contextRel, content, context, rel, appRouterRoot);
      }
      const scanned = scanFile(rel, content, diag);
      stampIdentityFiles(scanned, identityRoot, identityPath);
      findings.push(...scanned);
    }
  }

  return {
    targets: paths,
    // Files actually analyzed. Anything opened but not analyzed is counted
    // in `filesSkipped`: a clean verdict over unexamined code is the one
    // failure this report must never produce.
    filesScanned: diag.analyzed,
    filesSkipped: diag.skipped,
    linesSkipped: diag.linesSkipped,
    findings,
    suppressed: diag.suppressed,
    warnings: diag.warnings,
    context,
    baseline: null,
  };
}

function canonicalTargetPath(
  root: string,
  identityRoot: string | null,
): string {
  return identityRoot ? realpathSync(root) : root;
}

function findingIdentityPath(
  filePath: string,
  targetRoot: string,
  canonicalTarget: string,
  targetIsDirectory: boolean,
  identityRoot: string | null,
): string {
  if (!identityRoot) return filePath;
  return targetIsDirectory
    ? resolve(canonicalTarget, relative(targetRoot, filePath))
    : canonicalTarget;
}

function stampIdentityFiles(
  findings: ScanFinding[],
  identityRoot: string | null,
  identityPath: string,
): void {
  if (!identityRoot) return;
  const identityFile = toPosix(relative(identityRoot, identityPath));
  for (const finding of findings) {
    finding[FINDING_IDENTITY_FILE] = identityFile;
  }
}

export { newDiag, scanFile } from './detect.ts';
export {
  assignFingerprints,
  classifyFindings,
  hashFindingLine,
  normalizeLine,
  parseBaseline,
  serializeBaseline,
} from './baseline.ts';
export { formatJson, formatText } from './render.ts';
export { SEVERITY_ORDER, SIGNALS } from './signals.ts';
export type { ScanContext } from './context.ts';
export type {
  ClassifiedFinding,
  FindingClassification,
  FingerprintedFinding,
  PhaseBaseline,
} from './baseline.ts';
export type { ScanExecution, ScanFinding } from './detect.ts';
export type {
  BaselinedScanResult,
  ScanJson,
  ScanResult,
  UnbaselinedScanResult,
} from './render.ts';
export type {
  ScanExample,
  ScanNoise,
  ScanSeverity,
  ScanSignal,
} from './signals.ts';
export type { ScanDiag, ScanSkipped } from './walk.ts';
