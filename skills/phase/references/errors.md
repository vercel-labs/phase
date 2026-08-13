# `PhaseError` / `isPhaseError`

Every error includes a machine-readable `code` and an actionable message with `reason` and `fix` fields.

## Signature

```ts
import { PhaseError, isPhaseError } from 'phase';
import type { PhaseErrorCode } from 'phase';

// Check if an error is a PhaseError
if (isPhaseError(err)) {
  console.log(err.code, err.reason, err.fix);
}
```

### PhaseError properties

| Property  | Type                  | Description                       |
| --------- | --------------------- | --------------------------------- |
| `code`    | `PhaseErrorCode`      | Machine-readable error identifier |
| `reason`  | `string \| undefined` | Why the error occurred            |
| `fix`     | `string \| undefined` | How to resolve it                 |
| `message` | `string`              | Human-readable description        |

### Error codes

| Code               | Trigger                                        | Fix                                           |
| ------------------ | ---------------------------------------------- | --------------------------------------------- |
| `server_context`   | Calling a browser-only primitive during SSR    | Move into `useEffect` or client-only module   |
| `no_element`       | Passing null/undefined `element`               | Pass a mounted Element, or use the React hook |
| `invalid_duration` | `useTween` duration is zero, negative, or NaN  | Pass a positive number                        |
| `invalid_fps`      | An FPS cap is zero, negative, NaN, or infinite | Pass a finite positive number or `undefined`  |
| `ticker_stopped`   | Calling `start`/`resume` on a stopped ticker   | Create a new ticker instance                  |
| `missing_context`  | `<Swap.State>` used outside `<Swap>`           | Wrap with `<Swap>`                            |

## When to use

- Catching phase-specific errors in try/catch and branching on `code`.
- Distinguishing phase errors from other errors in error boundaries.
- Logging structured error information (code + reason + fix).

## When not to use

| Instead of this                         | Use                                                           |
| --------------------------------------- | ------------------------------------------------------------- |
| Preventing the error in the first place | Check the error code table above and avoid the trigger        |
| React error boundary                    | Standard React error boundary (`isPhaseError` helps classify) |

## Do

- Use `isPhaseError(err)` for type-narrowing in catch blocks.
- Log `err.code` in telemetry for structured error tracking.
- Read `err.fix` for actionable guidance.

## Don't

- **Don't catch and silently swallow PhaseErrors.** They indicate misconfiguration, not transient failures.
- **Don't wrap `onTick` in try/catch.** Defeats TurboFan optimization on the hot path.

## Reduced motion

Not applicable. Errors are not affected by motion preferences.

## See also

- [create-loop](./create-loop.md). Throws `server_context`, `no_element`
- [create-ticker](./create-ticker.md). Throws `server_context`, `invalid_fps`, `ticker_stopped`
- [use-tween](./use-tween.md). Throws `invalid_duration`
- [swap](./swap.md). Throws `missing_context`
