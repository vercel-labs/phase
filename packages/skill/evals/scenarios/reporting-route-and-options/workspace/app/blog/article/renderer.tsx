import { VideoScrubber } from './video-scrubber';

const blocks = {
  paragraph: () => <p>Article text</p>,
  video: VideoScrubber,
};

export function ArticleRenderer({ block }: { block: keyof typeof blocks }) {
  const Block = blocks[block];
  return (
    <article>
      <h1>Article</h1>
      <Block />
    </article>
  );
}
