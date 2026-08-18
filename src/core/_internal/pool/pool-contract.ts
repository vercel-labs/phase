/**
 * Shared behavioral contract for phase's subscription pools.
 *
 * Every pool wraps a browser resource that is expensive or leaky to hold, and
 * every one of them makes the same four promises: fan out to all subscribers of
 * a key, keep the survivors alive when one leaves, release the resource only
 * once the last leaves, and stay safe when a subscriber removes itself from its
 * own callback.
 *
 * Those promises were previously left implicit, and the IO and RO pools both
 * broke the first two independently. Each pool runs this suite against a small
 * adapter so the contract is stated once and enforced everywhere, without
 * shipping a shared runtime abstraction (the pools differ in keying depth and
 * in how they acquire and release, and their bytes are budgeted per export).
 *
 * This file is a test helper. It is only imported from `.spec` files, so it
 * never reaches a bundle.
 */

/** A pool's surface, reduced to what the contract needs. */
export interface PoolAdapter<K> {
  /** Subscribe to `key`; returns the pool's own cleanup function. */
  subscribe(key: K, callback: () => void): () => void;
  /** Deliver one notification to every subscriber of `key`. */
  notify(key: K): void;
  /** Whether the pool still holds the browser resource behind `key`. */
  isBound(key: K): boolean;
}

export interface PoolContract<K> {
  /**
   * Distinct keys, built fresh per test. A single entry means the pool has one
   * implicit key (a process-wide subscription rather than a keyed one).
   */
  keys(): readonly [K, ...K[]];
  /** Build the pool surface. Called inside each test, after mocks install. */
  create(): Promise<PoolAdapter<K>>;
}

/**
 * Register the shared pool contract. Call from a pool's spec after its
 * `beforeEach` installs the relevant browser mocks.
 */
export function describePoolContract<K>(contract: PoolContract<K>): void {
  // Read once at collection time purely to decide whether the multi-key clause
  // applies; each test builds its own fresh keys.
  const isKeyed: boolean = contract.keys().length > 1;

  describe('pool subscription contract', () => {
    it('delivers every notification to every subscriber of a key', async () => {
      const pool = await contract.create();
      const [key] = contract.keys();
      const first = vi.fn();
      const second = vi.fn();

      pool.subscribe(key, first);
      pool.subscribe(key, second);
      pool.notify(key);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('keeps the remaining subscribers when one releases', async () => {
      const pool = await contract.create();
      const [key] = contract.keys();
      const leaving = vi.fn();
      const staying = vi.fn();

      const release = pool.subscribe(key, leaving);
      pool.subscribe(key, staying);

      release();
      pool.notify(key);

      expect(leaving).not.toHaveBeenCalled();
      expect(staying).toHaveBeenCalledTimes(1);
    });

    it('holds the resource until the last subscriber releases', async () => {
      const pool = await contract.create();
      const [key] = contract.keys();

      const releaseFirst = pool.subscribe(key, vi.fn());
      const releaseSecond = pool.subscribe(key, vi.fn());
      expect(pool.isBound(key)).toBe(true);

      releaseFirst();
      expect(pool.isBound(key)).toBe(true);

      releaseSecond();
      expect(pool.isBound(key)).toBe(false);
    });

    it('treats a repeated release as a no-op and keeps a later subscriber', async () => {
      const pool = await contract.create();
      const [key] = contract.keys();

      const release = pool.subscribe(key, vi.fn());
      release();

      const later = vi.fn();
      pool.subscribe(key, later);
      release(); // already spent; must not disturb the new subscriber

      expect(pool.isBound(key)).toBe(true);
      pool.notify(key);
      expect(later).toHaveBeenCalledTimes(1);
    });

    it('lets a subscriber release itself from inside its own callback', async () => {
      const pool = await contract.create();
      const [key] = contract.keys();
      const other = vi.fn();
      let releaseSelf: (() => void) | undefined;
      const selfReleasing = vi.fn(() => releaseSelf?.());

      releaseSelf = pool.subscribe(key, selfReleasing);
      pool.subscribe(key, other);

      expect(() => pool.notify(key)).not.toThrow();
      expect(selfReleasing).toHaveBeenCalledTimes(1);
      expect(other).toHaveBeenCalledTimes(1);

      pool.notify(key);
      expect(selfReleasing).toHaveBeenCalledTimes(1);
      expect(other).toHaveBeenCalledTimes(2);
    });

    // Single-key pools have nothing to isolate.
    it.skipIf(!isKeyed)('keeps separate keys independent', async () => {
      const pool = await contract.create();
      const [keyA, keyB] = contract.keys();
      if (keyB === undefined) return;
      const onA = vi.fn();
      const onB = vi.fn();

      pool.subscribe(keyA, onA);
      const releaseB = pool.subscribe(keyB, onB);

      pool.notify(keyA);
      expect(onA).toHaveBeenCalledTimes(1);
      expect(onB).not.toHaveBeenCalled();

      releaseB();
      expect(pool.isBound(keyA)).toBe(true);
    });
  });
}
