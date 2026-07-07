# `createDevicePixelRatio`

Tracks `devicePixelRatio` changes (e.g. dragging the window between monitors with different pixel densities) via a shared `matchMedia` subscription. The framework-agnostic core behind `useDevicePixelRatio`.

## Signature

```ts
import { createDevicePixelRatio } from 'phase';

const watcher = createDevicePixelRatio(options: DevicePixelRatioOptions): DevicePixelRatio;
```

### Options

| Option     | Type                    | Default  | Description                                  |
| ---------- | ----------------------- | -------- | -------------------------------------------- |
| `onChange` | `(dpr: number) => void` | required | Called when devicePixelRatio changes         |
| `signal`   | `AbortSignal`           | —        | Stops the watcher when the signal is aborted |

### Return (DevicePixelRatio)

| Property | Type         | Description                                 |
| -------- | ------------ | ------------------------------------------- |
| `dpr`    | `number`     | Current devicePixelRatio (synchronous read) |
| `stop()` | `() => void` | Unsubscribe and cleanup                     |

## When to use

- Imperative, framework-free code that sizes a buffer by DPR (a resize bridge, a worker host, a vanilla WebGL setup).
- You need a synchronous `dpr` read plus a change subscription, outside React.

## When not to use

| Instead of this                        | Use                                           |
| -------------------------------------- | --------------------------------------------- |
| React component                        | `useDevicePixelRatio`                         |
| Canvas animation with DPR-aware sizing | `useCanvas` / `createLoop` handle DPR for you |
| One-shot read with no subscription     | `window.devicePixelRatio` directly            |

## Do

- Drive a resize bridge from the change callback and read `dpr` on demand:
  ```ts
  const watcher = createDevicePixelRatio({
    onChange: (dpr) => bridge.postMessage({ type: 'dpr', dpr }),
  });
  const bufferWidth = cssWidth * Math.min(watcher.dpr, 2);
  // cleanup:
  watcher.stop();
  ```
- Apply a performance cap (`Math.min(dpr, 2)`) where the workload is GPU-heavy. The cap is a consumer policy, not a phase concern.
- Multiple instances share one underlying subscription, so creating several is cheap.

## Don't

- **Don't poll `window.devicePixelRatio`.** It does not fire events; this watcher re-subscribes on every change so chained switches (A -> B -> C) are all caught.
- **Don't forget `stop()`.** The subscription lives until the last watcher stops.

## Reduced motion

Not applicable. `createDevicePixelRatio` reports a display property, not animation.

## See also

- [useDevicePixelRatio](./use-device-pixel-ratio.md). React hook wrapping this core
- [useCanvas](./use-canvas.md). Canvas with DPR-aware buffer sizing built in
- [createLifecycle](./create-lifecycle.md). Common pairing for imperative renderers
- [abort-signals](./abort-signals.md). Tear down this watcher via the `signal` option
