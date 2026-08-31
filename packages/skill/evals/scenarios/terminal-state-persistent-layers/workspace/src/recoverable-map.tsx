'use client';

import { useEffect, useRef, useState } from 'react';
import { useLoop } from 'phase/react';

export function RecoverableMap() {
  const liveLayerRef = useRef<HTMLDivElement>(null);
  const terminalUpdateCommitted = useRef(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [milestone, setMilestone] = useState<'loading' | 'ready'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const liveLayer = liveLayerRef.current;
    if (!liveLayer) return;

    let reliabilityTimeout = window.setTimeout(recordMilestone, 1500);
    function recordMilestone() {
      window.clearTimeout(reliabilityTimeout);
      setMilestone('ready');
    }

    liveLayer.addEventListener('transitionend', recordMilestone, { once: true });
    return () => {
      window.clearTimeout(reliabilityTimeout);
      liveLayer.removeEventListener('transitionend', recordMilestone);
    };
  }, [attempt]);

  function retryLiveLayer(): void {
    terminalUpdateCommitted.current = false;
    setMilestone('loading');
    setLoopEnabled(true);
    setAttempt((current) => current + 1);
  }

  useLoop({
    ref: liveLayerRef,
    enabled: loopEnabled,
    reducedMotion: 'complete',
    onTick: (frame) => {
      if (frame.elapsed < 1200 || terminalUpdateCommitted.current) return;
      terminalUpdateCommitted.current = true;
      setLoopEnabled(false);
    },
  });

  return (
    <section aria-label="Regional availability">
      <div data-layer="fallback" aria-hidden={milestone === 'ready'}>
        North America and Europe are active
      </div>
      <div ref={liveLayerRef} data-layer="live" data-milestone={milestone} />
      <button type="button" onClick={retryLiveLayer}>
        Retry live layer
      </button>
    </section>
  );
}
