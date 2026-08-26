'use client';

import { Defer } from 'phase/react';
import type { JSX } from 'react';

const styles = `
.phx-defer-basic {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  height: 360px;
  padding: 24px;
  border: 1px solid #bae6fd;
  border-radius: 16px;
  background: #f0f9ff;
  color: #082f49;
  font: 14px/1.6 ui-sans-serif, system-ui, sans-serif;
}
.phx-defer-basic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}
.phx-defer-basic-grid article {
  min-height: 100px;
  padding: 16px;
  border-radius: 12px;
  background: #bae6fd;
}
.phx-defer-basic-grid h3 { margin: 0 0 8px; font-size: 14px; }
.phx-defer-basic-grid p { margin: 0; }
`;

export default function DeferBasic(): JSX.Element {
  return (
    <>
      <style>{styles}</style>
      <Defer estimatedHeight="360px" className="phx-defer-basic">
        <strong>Content stays in the DOM</strong>
        <p>
          The browser can skip style, layout, and paint while this section is
          off-screen.
        </p>
        <div className="phx-defer-basic-grid">
          <article>
            <h3>Steady scroll range</h3>
            <p>
              A realistic estimate keeps scrollbar proportions steady until
              first render.
            </p>
          </article>
          <article>
            <h3>Real content</h3>
            <p>Children remain server-rendered and available to crawlers.</p>
          </article>
        </div>
      </Defer>
    </>
  );
}
