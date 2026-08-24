import { Testimonials } from './testimonials';

export const experimental_ppr = true;

export default function Page() {
  return (
    <main>
      <section>
        <h1>Ship faster</h1>
        <p>The platform for the modern web.</p>
      </section>
      <Testimonials />
    </main>
  );
}
