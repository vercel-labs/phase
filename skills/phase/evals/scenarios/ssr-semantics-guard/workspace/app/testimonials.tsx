const QUOTES = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  quote: 'phase quote number ' + i,
  author: 'Customer ' + i,
}));

export function Testimonials() {
  return (
    <ul>
      {QUOTES.map((q) => (
        <li key={q.id}>
          <blockquote>{q.quote}</blockquote>
          <cite>{q.author}</cite>
        </li>
      ))}
    </ul>
  );
}
