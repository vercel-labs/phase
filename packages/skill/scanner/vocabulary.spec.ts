import { SIGNALS } from './signals.ts';
import {
  FRAME_CALLBACK_DEFINITION,
  FRAME_DRIVER,
  INTERVAL_CALL,
  INTERSECTION_OBSERVER_CONSTRUCTOR,
  MOVE_HANDLER_PROP,
  MUTATION_OBSERVER_CONSTRUCTOR,
  POINTER_MOVE_LISTENER,
  RESIZE_OBSERVER_CONSTRUCTOR,
  TIMER_REFERENCE,
  WINDOW_LAYOUT_LISTENER,
} from './vocabulary.ts';

describe('scanner vocabulary', () => {
  it('preserves the original regex sources', () => {
    expect(FRAME_CALLBACK_DEFINITION.source).toBe(
      String.raw`\bonTick\s*[:=(]|\bonDraw\s*[:=(]|\bdraw\s*:`,
    );
    expect(POINTER_MOVE_LISTENER.source).toBe(
      String.raw`addEventListener\s*\(\s*['"](?:pointermove|mousemove|touchmove)['"]|\bon(?:PointerMove|MouseMove|TouchMove)\s*=\s*\{`,
    );
    expect(MOVE_HANDLER_PROP.source).toBe(
      String.raw`\bon(?:PointerMove|MouseMove|TouchMove)\s*=\s*\{`,
    );
    expect(WINDOW_LAYOUT_LISTENER.source).toBe(
      String.raw`addEventListener\s*\(\s*['"](?:resize|scroll)['"]`,
    );
    expect(INTERSECTION_OBSERVER_CONSTRUCTOR.source).toBe(
      String.raw`new\s+IntersectionObserver`,
    );
    expect(RESIZE_OBSERVER_CONSTRUCTOR.source).toBe(
      String.raw`new\s+ResizeObserver`,
    );
    expect(MUTATION_OBSERVER_CONSTRUCTOR.source).toBe(
      String.raw`new\s+MutationObserver`,
    );
    expect(INTERVAL_CALL.source).toBe(
      String.raw`\bsetInterval\s*(?:\?\.)?\s*\(`,
    );
    expect(TIMER_REFERENCE.source).toBe(String.raw`setInterval|setTimeout`);
    expect(FRAME_DRIVER.source).toBe(
      String.raw`\bonTick\b|\bonDraw\b|\bdraw\s*:|use(?:Loop|Canvas|Tween|Pointer|Scroll)\s*\(|create(?:Loop|Ticker|Pointer|Scroll)\s*\(|addEventListener\s*\(\s*['"](?:pointermove|mousemove|touchmove|scroll|resize|wheel|drag)|\bon(?:PointerMove|MouseMove|TouchMove)\s*=\s*\{|new\s+(?:Intersection|Resize|Mutation)Observer|setInterval\s*\(`,
    );
  });

  it('shares vocabulary between signal detection and execution ranking', () => {
    expect(signalPattern('setstate-in-ontick')).toBe(FRAME_CALLBACK_DEFINITION);
    expect(signalPattern('bare-window-listener')).toBe(WINDOW_LAYOUT_LISTENER);
    expect(signalPattern('pointer-listener-layout-read')).toBe(
      POINTER_MOVE_LISTENER,
    );
    expect(signalPattern('raw-io')).toBe(INTERSECTION_OBSERVER_CONSTRUCTOR);
    expect(signalPattern('raw-ro')).toBe(RESIZE_OBSERVER_CONSTRUCTOR);
    expect(signalPattern('mutationobserver-layout')).toBe(
      MUTATION_OBSERVER_CONSTRUCTOR,
    );
    expect(signalPattern('redundant-mutation-observers')).toBe(
      MUTATION_OBSERVER_CONSTRUCTOR,
    );
    expect(signalPattern('background-animation')).toBe(TIMER_REFERENCE);
    expect(signalPattern('timer-missing-reduced-motion')).toBe(TIMER_REFERENCE);
  });
});

function signalPattern(id: string): RegExp | undefined {
  return SIGNALS.find((signal) => signal.id === id)?.pattern;
}
