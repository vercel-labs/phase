import { renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';

import { useCanvas } from '.';

it('sizes and draws a canvas from native ResizeObserver data', async () => {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  container.style.cssText = 'width:100px;height:80px;';
  container.append(canvas);
  document.body.append(container);
  const containerRef = createRef<HTMLDivElement>();
  const canvasRef = createRef<HTMLCanvasElement>();
  containerRef.current = container;
  canvasRef.current = canvas;
  const draw = vi.fn();
  const { unmount } = renderHook(() =>
    useCanvas({
      containerRef,
      canvasRef,
      draw,
      reducedMotion: 'ignore',
    }),
  );
  const dpr = window.devicePixelRatio;

  await waitFor(() => {
    expect(canvas.width).toBe(100 * dpr);
    expect(canvas.height).toBe(80 * dpr);
  });
  await waitFor(() => expect(draw).toHaveBeenCalled());
  expect(canvas.style.width).toBe('100px');
  expect(canvas.style.height).toBe('80px');

  unmount();
  container.remove();
});
