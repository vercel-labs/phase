import { degradedConfig } from '.';

describe('degradedConfig', () => {
  it('defaults to throttle when degraded is undefined', () => {
    expect(degradedConfig(undefined, undefined)).toEqual({
      degraded: 'throttle',
      degradedFps: undefined,
    });
  });

  it('passes degradedFps through in throttle mode', () => {
    expect(degradedConfig('throttle', 20)).toEqual({
      degraded: 'throttle',
      degradedFps: 20,
    });
  });

  it('drops degradedFps for pause', () => {
    expect(degradedConfig('pause', 20)).toEqual({ degraded: 'pause' });
  });

  it('drops degradedFps for ignore', () => {
    expect(degradedConfig('ignore', 20)).toEqual({ degraded: 'ignore' });
  });
});
