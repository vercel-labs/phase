'use client';

import { useEffect, useRef } from 'react';

export function RuntimeTicker() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    function tick(time: number) {
      const node = ref.current;
      if (!node) return;
      const width = node.getBoundingClientRect().width;
      node.style.transform = `translateX(${Math.sin(time / 500) * width}px)`;
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div ref={ref}>Runtime ticker</div>;
}
