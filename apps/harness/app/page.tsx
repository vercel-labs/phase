import { manifest } from '@usephase/examples/manifest';
import type { JSX } from 'react';

const exampleSlugs = Object.keys(manifest);

export default function HarnessIndex(): JSX.Element {
  return (
    <main>
      <h1>Phase runtime harness</h1>
      <ul>
        {exampleSlugs.map((slug) => (
          <li key={slug}>
            <a href={`/examples/${slug}`}>{slug}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
