'use client';

import { useLoop } from 'phase/react';
import { useRef, type JSX } from 'react';

const styles = `
.phx-use-loop-basic {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  padding: 20px;
  border: 1px solid #d4d4d8;
  border-radius: 16px;
  background: #fafafa;
  color: #18181b;
  font: 14px/1.5 ui-sans-serif, system-ui, sans-serif;
}
.phx-use-loop-basic progress {
  display: block;
  width: 100%;
  height: 20px;
  margin-top: 12px;
}
.phx-use-loop-basic output { font-family: ui-monospace, SFMono-Regular, monospace; }
`;

export default function UseLoopBasic(): JSX.Element {
  const valueRef = useRef(50);
  const directionRef = useRef(0.04);
  const { ref, phase } = useLoop<HTMLProgressElement>({
    onTick(frame) {
      const progress = ref.current;
      if (!progress) return;

      let value = valueRef.current + directionRef.current * frame.delta;
      if (value >= 100) {
        value = 100;
        directionRef.current = -0.04;
      } else if (value <= 0) {
        value = 0;
        directionRef.current = 0.04;
      }
      valueRef.current = value;
      progress.value = value;
    },
  });

  return (
    <section className="phx-use-loop-basic">
      <style>{styles}</style>
      <strong>Animation that pauses off-screen</strong>
      <div>
        Status: <output>{phase}</output>
      </div>
      <progress ref={ref} max={100} value={50} aria-label="Animated progress" />
    </section>
  );
}
