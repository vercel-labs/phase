'use client';

import { useEffect } from 'react';

export function DashboardClient(props: Record<string, unknown>) {
  useEffect(() => {
    let frame = 0;
    function draw() {
      document.body.style.opacity = String(Date.now() % 2);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <main>{JSON.stringify(props)}</main>;
}
