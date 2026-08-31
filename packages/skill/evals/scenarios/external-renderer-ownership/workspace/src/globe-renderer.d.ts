declare module '@acme/globe-renderer' {
  export class Renderer {
    readonly canvas: HTMLCanvasElement;

    constructor(
      canvas: HTMLCanvasElement,
      options: { gestures: 'orbit'; pixelRatio: number },
    );

    start(): void;
    pause(): void;
    resume(): void;
    movePointer(x: number, y: number): void;
    resize(width: number, height: number): void;
    setPixelRatio(pixelRatio: number): void;
    dispose(): void;
  }
}
