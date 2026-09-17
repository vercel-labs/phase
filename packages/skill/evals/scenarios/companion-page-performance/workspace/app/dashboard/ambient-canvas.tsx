'use client';

import { useEffect, useRef } from 'react';

export function AmbientCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;
    function draw() {
      ref.current?.getContext('2d')?.fillRect(0, 0, 1, 1);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} />;
}
