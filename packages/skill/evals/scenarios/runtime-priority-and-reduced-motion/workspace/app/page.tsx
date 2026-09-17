import './ambient.css';
import { RuntimeTicker } from './runtime-ticker';

export default function Page() {
  return (
    <main>
      <RuntimeTicker />
      <div className="ambient-status">Ambient status</div>
    </main>
  );
}
