'use client';

import { useEffect } from 'react';

export default function Page() {
  useEffect(() => {
    let frame = 0;
    function tick() {
      drawAmbientFrame();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <main>Dashboard</main>;
}

function drawAmbientFrame() {}
