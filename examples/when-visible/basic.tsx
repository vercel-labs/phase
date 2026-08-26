'use client';

import { WhenVisible } from 'phase/react';
import type { JSX } from 'react';

const styles = `
.phx-when-visible-basic {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  height: 220px;
  padding: 24px;
  border: 1px solid #a7f3d0;
  border-radius: 16px;
  background: #ecfdf5;
  color: #022c22;
  font: 14px/1.5 ui-sans-serif, system-ui, sans-serif;
  transition: opacity 300ms ease, transform 300ms ease;
}
.phx-when-visible-basic-fallback {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  border-radius: 12px;
  background: #d1fae5;
}
.phx-when-visible-basic-content {
  display: grid;
  height: 100%;
  place-items: center;
  border-radius: 12px;
  background: #6ee7b7;
  text-align: center;
}
@starting-style {
  .phx-when-visible-basic[data-enter='animate'] {
    opacity: 0;
    transform: translateY(12px);
  }
}
`;

const fallback = (
  <div className="phx-when-visible-basic-fallback">
    Content appears as you scroll closer.
  </div>
);

export default function WhenVisibleBasic(): JSX.Element {
  return (
    <>
      <style>{styles}</style>
      <WhenVisible
        rootMargin="200px"
        fallback={fallback}
        className="phx-when-visible-basic"
      >
        <div className="phx-when-visible-basic-content">
          <strong>The content appears without moving the page.</strong>
        </div>
      </WhenVisible>
    </>
  );
}
