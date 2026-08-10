import { useEffect, useRef, useState } from 'react';

export function HeroAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    function loop() {
      setProgress((p) => (p + 1) % 100);
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div ref={ref} style={{ opacity: progress / 100 }} />;
}
