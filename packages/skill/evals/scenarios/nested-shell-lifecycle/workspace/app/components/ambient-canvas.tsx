'use client';

import { useEffect, useRef } from 'react';

export function AmbientCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;
    function draw(time: number) {
      const context = ref.current?.getContext('2d');
      context?.clearRect(0, 0, 320, 180);
      context?.fillRect(20 + Math.sin(time / 500) * 10, 20, 40, 40);
      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} height={180} width={320} />;
}
