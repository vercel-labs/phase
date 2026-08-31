'use client';

import { Renderer } from '@acme/globe-renderer';
import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLifecycle } from 'phase/react';

export function RendererCanvas() {
  const rendererRef = useRef<Renderer | null>(null);
  const activeRef = useRef(false);
  const startedRef = useRef(false);
  const { ref } = useLifecycle<HTMLCanvasElement>({
    reducedMotion: 'ignore',
    onPhaseChange: (phase) => {
      activeRef.current = phase === 'active';
      const renderer = rendererRef.current;
      if (!renderer) return;
      if (activeRef.current) startOrResume(renderer);
      else if (startedRef.current) renderer.pause();
    },
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const renderer = new Renderer(canvas, {
      gestures: 'orbit',
      pixelRatio: window.devicePixelRatio,
    });
    rendererRef.current = renderer;
    if (activeRef.current) startOrResume(renderer);

    return () => {
      renderer.dispose();
      rendererRef.current = null;
      startedRef.current = false;
    };
  }, [ref]);

  function startOrResume(renderer: Renderer): void {
    if (startedRef.current) {
      renderer.resume();
      return;
    }
    startedRef.current = true;
    renderer.start();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const renderer = rendererRef.current;
    if (renderer) forwardPointer(renderer, event.nativeEvent);
  }

  return <canvas ref={ref} onPointerMove={handlePointerMove} />;
}

function forwardPointer(renderer: Renderer, event: PointerEvent): void {
  const bounds = renderer.canvas.getBoundingClientRect();
  renderer.movePointer(event.clientX - bounds.left, event.clientY - bounds.top);
}
