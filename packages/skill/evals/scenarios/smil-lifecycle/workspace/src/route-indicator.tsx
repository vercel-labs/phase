import { usePrefersReducedMotion } from 'phase/react';
import { useEffect, useRef } from 'react';

export function RouteIndicator() {
  const reducedMotion = usePrefersReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const pulseRef = useRef<SVGAnimateElement>(null);

  useEffect(() => {
    window.setTimeout(() => pulseRef.current?.beginElement(), 600);
  }, []);

  return (
    <svg ref={svgRef} viewBox="0 0 120 24" aria-label="Loading route">
      <path d="M4 12 C32 2 88 22 116 12">
        <animate
          attributeName="d"
          values="M4 12 C32 2 88 22 116 12;M4 12 C32 22 88 2 116 12;M4 12 C32 2 88 22 116 12"
          dur="1.8s"
          repeatCount={reducedMotion ? 1 : 'indefinite'}
        />
      </path>
      <circle cx="4" cy="12" r="3">
        <animate
          ref={pulseRef}
          attributeName="r"
          values="3;5;3"
          dur="800ms"
          begin="indefinite"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
