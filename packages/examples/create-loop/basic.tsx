'use client';

import { createLoop } from 'phase';
import { useEffect, useRef, type JSX } from 'react';

const styles = `
.phx-create-loop-basic {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  padding: 20px;
  border: 1px solid #fed7aa;
  border-radius: 16px;
  background: #fff7ed;
  color: #431407;
  font: 14px/1.5 ui-sans-serif, system-ui, sans-serif;
}
.phx-create-loop-basic progress {
  display: block;
  width: 100%;
  height: 20px;
  margin-top: 12px;
}
.phx-create-loop-basic output { font-family: ui-monospace, SFMono-Regular, monospace; }
`;

export default function CreateLoopBasic(): JSX.Element {
  const targetRef = useRef<HTMLProgressElement>(null);
  const phaseRef = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    const target = targetRef.current;
    const phaseOutput = phaseRef.current;
    if (!target || !phaseOutput) return;

    let value = 50;
    let direction = 0.04;
    // This example intentionally teaches the core API. Prefer useLoop in application components.
    const loop = createLoop({
      target,
      onTick(frame) {
        value += direction * frame.delta;
        if (value >= 100) {
          value = 100;
          direction = -0.04;
        } else if (value <= 0) {
          value = 0;
          direction = 0.04;
        }
        target.value = value;
      },
      onPhaseChange(phase) {
        phaseOutput.textContent = phase;
      },
    });

    return () => loop.stop();
  }, []);

  return (
    <section className="phx-create-loop-basic">
      <style>{styles}</style>
      <strong>createLoop in React</strong>
      <div>
        Status: <output ref={phaseRef}>idle</output>
      </div>
      <progress
        ref={targetRef}
        max={100}
        value={50}
        aria-label="Animated progress"
      />
    </section>
  );
}
