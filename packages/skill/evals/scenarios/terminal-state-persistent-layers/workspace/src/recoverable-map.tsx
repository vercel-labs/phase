'use client';

import { useEffect, useRef, useState } from 'react';
import { useLoop } from 'phase/react';

export function RecoverableMap() {
  const liveLayerRef = useRef<HTMLDivElement>(null);
  const finalUpdateSent = useRef(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const liveLayer = liveLayerRef.current;
    if (!liveLayer) return;

    let backupTimeout = window.setTimeout(markReady, 1500);
    function markReady() {
      window.clearTimeout(backupTimeout);
      setStatus('ready');
    }

    liveLayer.addEventListener('transitionend', markReady, { once: true });
    return () => {
      window.clearTimeout(backupTimeout);
      liveLayer.removeEventListener('transitionend', markReady);
    };
  }, [attempt]);

  function retryLiveLayer(): void {
    finalUpdateSent.current = false;
    setStatus('loading');
    setLoopEnabled(true);
    setAttempt((current) => current + 1);
  }

  useLoop({
    ref: liveLayerRef,
    enabled: loopEnabled,
    reducedMotion: 'complete',
    onTick: (frame) => {
      if (frame.elapsed < 1200 || finalUpdateSent.current) return;
      finalUpdateSent.current = true;
      setLoopEnabled(false);
    },
  });

  return (
    <section aria-label="Regional availability">
      <div data-layer="fallback" aria-hidden={status === 'ready'}>
        North America and Europe are active
      </div>
      <div ref={liveLayerRef} data-layer="live" data-status={status} />
      <button type="button" onClick={retryLiveLayer}>
        Retry live layer
      </button>
    </section>
  );
}
