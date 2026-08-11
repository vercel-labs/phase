import { useEffect, useRef } from 'react';

export function LazyImage({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) ref.current?.setAttribute('src', src);
    });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [src]);

  return <img ref={ref} alt="" />;
}
