import { manifest, type ExampleSlug } from '@usephase/examples/manifest';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

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
    <main data-example-slug={slug}>
      <div aria-hidden="true" style={{ height: '150vh' }} />
      <Example />
      <div aria-hidden="true" style={{ height: '150vh' }} />
    </main>
  );
}

function isExampleSlug(slug: string): slug is ExampleSlug {
  return Object.prototype.hasOwnProperty.call(manifest, slug);
}
