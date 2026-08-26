'use client';

import { useTween } from 'phase/react';
import { useState, type JSX } from 'react';

const styles = `
.phx-use-tween-basic {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  padding: 20px;
  border: 1px solid #c4b5fd;
  border-radius: 16px;
  background: #f5f3ff;
  color: #2e1065;
  font: 14px/1.5 ui-sans-serif, system-ui, sans-serif;
}
.phx-use-tween-basic button {
  margin-bottom: 16px;
  padding: 8px 12px;
  border: 0;
  border-radius: 999px;
  background: #6d28d9;
  color: white;
  cursor: pointer;
  font: inherit;
}
.phx-use-tween-basic-track {
  height: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: #ddd6fe;
}
.phx-use-tween-basic-value {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: #7c3aed;
  transform-origin: left;
}
`;

export default function UseTweenBasic(): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const progress = useTween({ to: expanded ? 100 : 24, duration: 450 });

  return (
    <section className="phx-use-tween-basic">
      <style>{styles}</style>
      <button type="button" onClick={() => setExpanded((current) => !current)}>
        {expanded ? 'Shrink bar' : 'Grow bar'}
      </button>
      <div
        className="phx-use-tween-basic-track"
        aria-label="Animated progress bar"
      >
        <div
          className="phx-use-tween-basic-value"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>
    </section>
  );
}
