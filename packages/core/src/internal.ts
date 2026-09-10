export {
  conflictingTargetError,
  invalidDurationError,
  missingContextError,
} from './_internal/errors';
export { readDpr, subscribeDpr } from './_internal/pool/dpr';
export { readMediaQuery, subscribeMediaQuery } from './_internal/pool/mql-pool';
export {
  observeResize,
  type ResizeDeliverySource,
} from './_internal/pool/ro-pool';
export { REDUCED_MOTION_QUERY } from './reduced-motion';
