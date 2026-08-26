import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { SKIP_DIRS, toPosix } from './walk.ts';

export interface ScanContext {
  framework: 'next' | null;
  appRouter: boolean;
  ppr: boolean;
  clientComponents: number;
  evidence: string[];
}

// Best-effort environment detection so recommendations can account for
// rendering semantics (see references/audit.md Step 2.5). Walks up from the
// target toward the project root (nearest next.config, package.json, or
// .git), so scanning a subdirectory of a Next.js app still finds its config.
// Returns the project root it stopped at, which anchors router detection for
// nested targets. next.config is optional in Next.js, so a package.json root
// is still a usable anchor. File-content markers work at any depth regardless.
export function detectProjectRoot(
  root: string,
  context: ScanContext,
): string | null {
  let dir = root;
  for (let depth = 0; depth < 10; depth++) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }
    const config = entries.find((e) =>
      /^next\.config\.(js|mjs|ts|cjs)$/.test(e),
    );
    if (config) {
      context.framework = 'next';
      noteEvidence(
        context,
        toPosix(relative(process.cwd(), join(dir, config))),
      );
      try {
        const content = readFileSync(join(dir, config), 'utf8');
        if (
          /\b(?:ppr|experimental_ppr|cacheComponents)\s*[:=]\s*(?:true|['"]incremental['"])/.test(
            content,
          )
        ) {
          context.ppr = true;
        }
      } catch {
        /* unreadable config */
      }
      return dir;
    }
    // Project root without a Next config: stop rather than escape into an
    // unrelated parent project.
    if (entries.includes('package.json') || entries.includes('.git'))
      return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const ROUTE_FILE = /^(?:page|layout|template|default|route)\.[jt]sx?$/;

// A directory named `app` is only an App Router root when it actually holds
// route files. Pages Router projects and plain repos routinely keep an
// unrelated `app/` folder, and claiming App Router for those is what turns a
// scanner miss into a recommendation that breaks SSR or PPR.
export function detectAppRouterRoot(base: string): string | null {
  for (const prefix of ['app', 'src/app']) {
    if (containsRouteFile(join(base, prefix))) return prefix;
  }
  return null;
}

// Breadth-first with a visit budget: route files sit near the top of a router
// tree, so this stops early on real projects and cannot walk a huge unrelated
// `app/` directory to a halt.
function containsRouteFile(appRoot: string): boolean {
  const queue: string[] = [appRoot];
  for (let visited = 0; visited < 64 && queue.length > 0; visited++) {
    const dir = queue.shift() as string;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && ROUTE_FILE.test(entry.name)) return true;
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        queue.push(join(dir, entry.name));
      }
    }
  }
  return false;
}

export function updateContext(
  projectRel: string,
  content: string,
  context: ScanContext,
  evidencePath: string = projectRel,
  appRouterRoot: string | null = null,
): void {
  if (
    appRouterRoot &&
    (projectRel === appRouterRoot || projectRel.startsWith(`${appRouterRoot}/`))
  ) {
    context.appRouter = true;
    context.framework ??= 'next';
    noteEvidence(context, evidencePath);
  }
  // The route-segment config shape, not the bare token: prose or tooling
  // that merely mentions experimental_ppr must not count as detection.
  if (/\bexport\s+const\s+experimental_ppr\s*=\s*true\b/.test(content)) {
    context.ppr = true;
    context.framework ??= 'next';
    noteEvidence(context, evidencePath);
  }
  if (/^\s*['"]use client['"]/m.test(content)) {
    context.clientComponents++;
  }
}

// Enough to judge the stamp, not a second report.
const MAX_EVIDENCE = 3;

function noteEvidence(context: ScanContext, path: string): void {
  if (context.evidence.length >= MAX_EVIDENCE) return;
  if (!context.evidence.includes(path)) context.evidence.push(path);
}
