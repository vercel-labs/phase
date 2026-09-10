import { prefersReducedMotion } from '.';

it('reads the native reduced-motion preference', () => {
  expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
  expect(prefersReducedMotion()).toBe(true);
});
