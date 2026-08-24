'use client';

import { useEffect, useRef } from 'react';

export function SharedChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    function draw(time: number) {
      const context = canvasRef.current?.getContext('2d');
      if (context) {
        const x = 320 + Math.sin(time / 500) * 120;
        context.clearRect(0, 0, 640, 320);
        context.fillRect(x, 80, 24, 160);
      }
      requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
  }, []);

  return <canvas ref={canvasRef} width={640} height={320} />;
}
