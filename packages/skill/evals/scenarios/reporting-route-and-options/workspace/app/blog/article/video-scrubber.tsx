'use client';

import { Component, createRef, type MouseEvent as ReactMouseEvent } from 'react';

export class VideoScrubber extends Component<
  Record<string, never>,
  { intentPosition: number; progress: number }
> {
  state = { intentPosition: 0, progress: 0 };
  trackRef = createRef<HTMLDivElement>();

  componentWillUnmount() {
    window.removeEventListener('mousemove', this.handleDrag);
    window.removeEventListener('mouseup', this.handleDragEnd);
  }

  readProgress = (pageX: number) => {
    const rect = this.trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(
      0,
      Math.min(1, (pageX - rect.left - window.scrollX) / rect.width),
    );
  };

  handleMouseMove = (event: ReactMouseEvent) => {
    const pageX = event.pageX;
    requestAnimationFrame(() => {
      this.setState({ intentPosition: this.readProgress(pageX) });
    });
  };

  handleDrag = (event: MouseEvent) => {
    this.setState({ progress: this.readProgress(event.pageX) });
  };

  handleDragEnd = () => {
    window.removeEventListener('mousemove', this.handleDrag);
    window.removeEventListener('mouseup', this.handleDragEnd);
  };

  handleMouseDown = () => {
    window.addEventListener('mousemove', this.handleDrag);
    window.addEventListener('mouseup', this.handleDragEnd);
  };

  render() {
    return (
      <div
        aria-label="Video progress"
        onMouseDown={this.handleMouseDown}
        onMouseMove={this.handleMouseMove}
        ref={this.trackRef}
      >
        <div style={{ transform: `scaleX(${this.state.progress})` }} />
      </div>
    );
  }
}
