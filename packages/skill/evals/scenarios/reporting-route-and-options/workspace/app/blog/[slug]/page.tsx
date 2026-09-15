import { ArticleRenderer } from '../article/renderer';

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const block = slug === 'video' ? 'video' : 'paragraph';
  return <ArticleRenderer block={block} />;
}
