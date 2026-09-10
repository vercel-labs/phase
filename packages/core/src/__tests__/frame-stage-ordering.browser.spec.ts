import { createPointer, createTicker } from '../index';

it('flushes pointer input before the next native ticker callback', async () => {
  const element = document.createElement('div');
  element.style.cssText = 'width:100px;height:100px;';
  document.body.append(element);
  const pointer = createPointer({
    target: element,
    visibility: 'ignore',
    onPointer: vi.fn(),
  });
  const observedX: number[] = [];
  const ticker = createTicker({
    onTick: () => observedX.push(pointer.state.x),
  });
  ticker.start();
  await vi.waitFor(() => expect(observedX.length).toBeGreaterThan(0));
  observedX.length = 0;
  const { left, top } = element.getBoundingClientRect();

  element.dispatchEvent(new Event('pointerenter'));
  element.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: left + 42,
      clientY: top + 43,
    }),
  );

  await vi.waitFor(() => expect(observedX.length).toBeGreaterThan(0));
  expect(observedX[0]).toBeCloseTo(42, 0);

  ticker.stop();
  pointer.stop();
  element.remove();
});
