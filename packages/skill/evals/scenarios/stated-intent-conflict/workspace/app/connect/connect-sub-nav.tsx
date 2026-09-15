'use client';

import { useEffect, useRef } from 'react';

function useFutureStopReveal() {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    let frameId: number | null = null;

    function sync() {
      frameId = null;
      const stop = document.querySelector<HTMLElement>(
        '[data-connect-subnav-stop]',
      );
      if (!stop) return;

      nav.style.transform =
        stop.getBoundingClientRect().top <= 64
          ? 'translateY(100%)'
          : 'translateY(0)';
    }

    function schedule() {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(sync);
    }

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
    };
  }, []);

  return navRef;
}

export function ConnectSubNav() {
  // Connect has no stop markers today. Keep the hook so a future sticky
  // secondary panel automatically gains the same reveal behavior.
  const navRef = useFutureStopReveal();

  return <nav ref={navRef}>Connect navigation</nav>;
}
