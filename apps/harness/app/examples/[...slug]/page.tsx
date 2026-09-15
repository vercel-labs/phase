import { manifest, type ExampleSlug } from '@usephase/examples/manifest';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

import { ExampleHost } from './example-host';

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export function generateStaticParams(): Array<{ slug: string[] }> {
  return Object.keys(manifest).map((slug) => ({ slug: slug.split('/') }));
}

export default async function ExamplePage({
  params,
}: PageProps): Promise<JSX.Element> {
  const { slug: segments } = await params;
  const slug = segments.join('/');
  if (!isExampleSlug(slug)) notFound();

  const { default: Example } = await manifest[slug]();

  return (
    <ExampleHost slug={slug}>
      <Example />
    </ExampleHost>
  );
}

function isExampleSlug(slug: string): slug is ExampleSlug {
  return Object.prototype.hasOwnProperty.call(manifest, slug);
}
