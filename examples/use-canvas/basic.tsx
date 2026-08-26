'use client';

import { useCanvas, type CanvasDrawFn } from 'phase/react';
import { useRef, type JSX } from 'react';

const styles = `
.phx-use-canvas-basic {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  padding: 20px;
  border: 1px solid #bfdbfe;
  border-radius: 16px;
  background: #eff6ff;
  color: #172554;
  font: 14px/1.5 ui-sans-serif, system-ui, sans-serif;
}
.phx-use-canvas-basic-canvas {
  width: 100%;
  height: 180px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: 12px;
  background: #172554;
}
.phx-use-canvas-basic canvas { display: block; }
.phx-use-canvas-basic output { font-family: ui-monospace, SFMono-Regular, monospace; }
`;

const draw: CanvasDrawFn = (context, frame, size) => {
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = '#60a5fa';
  context.beginPath();
  context.arc(
    size.width / 2 + Math.sin(frame.elapsed / 700) * size.width * 0.3,
    size.height / 2,
    14,
    0,
    Math.PI * 2,
  );
  context.fill();
};

export default function UseCanvasBasic(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { phase } = useCanvas({ containerRef, canvasRef, draw });

  return (
    <section className="phx-use-canvas-basic">
      <style>{styles}</style>
      <strong>Canvas that resizes and stays sharp</strong>
      <div>
        Status: <output>{phase}</output>
      </div>
      <div ref={containerRef} className="phx-use-canvas-basic-canvas">
        <canvas ref={canvasRef} aria-label="Animated blue marker" />
      </div>
    </section>
  );
}
