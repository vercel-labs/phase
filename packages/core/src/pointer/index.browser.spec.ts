import { page } from 'vitest/browser';

import { createPointer } from '.';

it('tracks browser-driven pointer input on an animation frame', async () => {
  const target = document.createElement('div');
  target.dataset.testid = 'pointer-target';
  target.style.cssText = 'width:100px;height:100px;';
  document.body.append(target);
  const onPointer = vi.fn();
  const pointer = createPointer({
    target,
    visibility: 'ignore',
    onPointer,
  });

  await page
    .getByTestId('pointer-target')
    .hover({ position: { x: 40, y: 50 } });

  await vi.waitFor(() => {
    expect(onPointer).toHaveBeenCalled();
    expect(pointer.state.active).toBe(true);
    expect(pointer.state.x).toBeCloseTo(40, 0);
    expect(pointer.state.y).toBeCloseTo(50, 0);
  });

  pointer.stop();
  target.remove();
});
