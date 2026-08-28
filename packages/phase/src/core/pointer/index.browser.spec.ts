import { page } from 'vitest/browser';

import { createPointer } from '.';

it('tracks browser-driven pointer input on an animation frame', async () => {
  const target = document.createElement('div');
  target.dataset.testid = 'pointer-target';
  target.style.cssText = 'width:100px;height:100px;';
  document.body.append(target);
  const states: Array<{ x: number; y: number; active: boolean }> = [];
  const pointer = createPointer({
    target,
    visibility: 'ignore',
    onPointer: (state) => states.push({ ...state }),
  });

  await page
    .getByTestId('pointer-target')
    .hover({ position: { x: 40, y: 50 } });

  await vi.waitFor(() =>
    expect(states.some((state) => state.active)).toBe(true),
  );
  const activeState = states.find((state) => state.active);
  expect(activeState?.x).toBeCloseTo(40, 0);
  expect(activeState?.y).toBeCloseTo(50, 0);

  pointer.stop();
  target.remove();
});
