import { page } from 'vitest/browser';

import { readMediaQuery, subscribeMediaQuery } from './mql-pool';

it('reads and subscribes to a native media query', async () => {
  await page.viewport(800, 600);
  const query = '(max-width: 600px)';
  const callback = vi.fn();
  const unsubscribe = subscribeMediaQuery(query, callback);

  expect(readMediaQuery(query)).toBe(false);
  await page.viewport(500, 600);
  await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true));
  expect(readMediaQuery(query)).toBe(true);

  unsubscribe();
  await page.viewport(800, 600);
});
