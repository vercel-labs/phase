import { clamp01, easeOutCubic } from 'phase/ease';
import { useLoop } from 'phase/react';
import { useRef } from 'react';

const DURATION = 1200;

export function LogoEditor() {
  const segmentRef = useRef<SVGGElement>(null);
  const cursorRef = useRef<SVGGElement>(null);

  const tick = (frame: { elapsed: number }) => {
    const segment = segmentRef.current;
    const cursor = cursorRef.current;
    if (!segment || !cursor) return;

    const progress = easeOutCubic(clamp01(frame.elapsed / DURATION));
    const transform = segment.transform.baseVal.getItem(0);
    transform.setTranslate(-24 * (1 - progress), 12 * (1 - progress));
    cursor.style.opacity = String(progress);
  };

  const { ref } = useLoop<SVGSVGElement>({
    onTick: tick,
    fps: 60,
    reducedMotion: 'pause',
  });

  return (
    <svg ref={ref} viewBox="0 0 100 40">
      <g ref={segmentRef} transform="translate(-24 12)">
        <path d="M0 20 C20 0 40 40 60 20" />
      </g>
      <g ref={cursorRef} opacity="0" />
    </svg>
  );
}
