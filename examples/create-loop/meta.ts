import type { ExampleMeta } from '../types.ts';

export default {
  title: 'Core animation loop',
  description:
    'Wraps createLoop in a React effect while preserving explicit teardown.',
  exports: ['createLoop'],
} satisfies ExampleMeta;
