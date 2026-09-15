import { resolve } from 'node:path';

// Size checks run without build output. Resolve core to source so every React
// row includes the tree-shaken core code that the binding pulls in.
const coreSource = resolve(import.meta.dirname, '..', 'core', 'src');
const coreSourceAliases = {
  '@usephase/core/ease': resolve(coreSource, 'ease', 'index.ts'),
  '@usephase/core/internal': resolve(coreSource, 'internal.ts'),
  '@usephase/core': resolve(coreSource, 'index.ts'),
};

function bundleCoreSource(config = {}) {
  return {
    ...config,
    alias: {
      ...config.alias,
      ...coreSourceAliases,
    },
  };
}

const checks = [
  {
    name: 'useLoop',
    path: 'src/index.ts',
    import: '{ useLoop }',
    ignore: ['react'],
    limit: '3.7 kB',
  },
  {
    name: 'useLifecycle',
    path: 'src/index.ts',
    import: '{ useLifecycle }',
    ignore: ['react'],
    limit: '2.1 kB',
  },
  {
    name: 'useSight',
    path: 'src/index.ts',
    import: '{ useSight }',
    ignore: ['react'],
    limit: '1.6 kB',
  },
  {
    name: 'useCanvas',
    path: 'src/index.ts',
    import: '{ useCanvas }',
    ignore: ['react'],
    limit: '4.5 kB',
  },
  {
    name: 'useMutation',
    path: 'src/index.ts',
    import: '{ useMutation }',
    ignore: ['react'],
    limit: '1.85 kB',
  },
  {
    name: 'usePointer',
    path: 'src/index.ts',
    import: '{ usePointer }',
    ignore: ['react'],
    limit: '2 kB',
  },
  {
    name: 'useScroll',
    path: 'src/index.ts',
    import: '{ useScroll }',
    ignore: ['react'],
    limit: '2.65 kB',
  },
  {
    name: 'useThrottledCallback',
    path: 'src/index.ts',
    import: '{ useThrottledCallback }',
    ignore: ['react'],
    limit: '1.2 kB',
  },
  {
    name: 'useDebouncedCallback',
    path: 'src/index.ts',
    import: '{ useDebouncedCallback }',
    ignore: ['react'],
    limit: '760 B',
  },
  {
    name: 'useTween',
    path: 'src/index.ts',
    import: '{ useTween }',
    ignore: ['react'],
    limit: '720 B',
  },
  {
    name: 'usePresence',
    path: 'src/index.ts',
    import: '{ usePresence }',
    ignore: ['react'],
    limit: '725 B',
  },
  {
    name: 'useScrollProgress',
    path: 'src/index.ts',
    import: '{ useScrollProgress }',
    ignore: ['react'],
    limit: '1.2 kB',
  },
  {
    name: 'useSize',
    path: 'src/index.ts',
    import: '{ useSize }',
    ignore: ['react'],
    limit: '680 B',
  },
  {
    name: 'useContainerQuery',
    path: 'src/index.ts',
    import: '{ useContainerQuery }',
    ignore: ['react'],
    limit: '600 B',
  },
  {
    name: 'useMediaQuery',
    path: 'src/index.ts',
    import: '{ useMediaQuery }',
    ignore: ['react'],
    limit: '300 B',
  },
  {
    name: 'usePrefersReducedMotion',
    path: 'src/index.ts',
    import: '{ usePrefersReducedMotion }',
    ignore: ['react'],
    limit: '300 B',
  },
  {
    name: 'useDevicePixelRatio',
    path: 'src/index.ts',
    import: '{ useDevicePixelRatio }',
    ignore: ['react'],
    limit: '400 B',
  },
  {
    name: 'useSyncedRef',
    path: 'src/index.ts',
    import: '{ useSyncedRef }',
    ignore: ['react'],
    limit: '30 B',
  },
  {
    name: 'useStableCallback',
    path: 'src/index.ts',
    import: '{ useStableCallback }',
    ignore: ['react'],
    limit: '50 B',
  },
  {
    name: 'Presence',
    path: 'src/index.ts',
    import: '{ Presence }',
    ignore: ['react'],
    limit: '750 B',
  },
  {
    name: 'WhenVisible',
    path: 'src/index.ts',
    import: '{ WhenVisible }',
    ignore: ['react'],
    limit: '1.85 kB',
  },
  {
    name: 'WhenIdle',
    path: 'src/index.ts',
    import: '{ WhenIdle }',
    ignore: ['react'],
    limit: '0.66 kB',
  },
  {
    name: 'Defer',
    path: 'src/index.ts',
    import: '{ Defer }',
    ignore: ['react'],
    limit: '105 B',
  },
  {
    name: 'useIdle',
    path: 'src/index.ts',
    import: '{ useIdle }',
    ignore: ['react'],
    limit: '520 B',
  },
  {
    name: 'useWhenIdle',
    path: 'src/index.ts',
    import: '{ useWhenIdle }',
    ignore: ['react'],
    limit: '530 B',
  },
  {
    name: 'useRenderState',
    path: 'src/index.ts',
    import: '{ useRenderState }',
    ignore: ['react'],
    limit: '550 B',
  },
  {
    name: 'Swap',
    path: 'src/index.ts',
    import: '{ Swap }',
    ignore: ['react'],
    limit: '1.25 kB',
  },
];

for (const check of checks) {
  check.modifyEsbuildConfig = bundleCoreSource;
}

export default checks;
