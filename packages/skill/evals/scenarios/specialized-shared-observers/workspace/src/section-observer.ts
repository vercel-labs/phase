type SelectionListener = (target: Element | null) => void;
type SizeListener = (target: Element, width: number, height: number) => void;

export class SectionObserver {
  private readonly visibility: IntersectionObserver;
  private readonly sizes: ResizeObserver;
  private readonly targets = new Set<Element>();
  private readonly ratios = new Map<Element, number>();
  private readonly onSelection: SelectionListener;
  private selected: Element | null = null;

  constructor(onSelection: SelectionListener, onSize: SizeListener) {
    this.onSelection = onSelection;
    this.visibility = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!this.targets.has(entry.target)) continue;
        this.ratios.set(
          entry.target,
          entry.isIntersecting ? entry.intersectionRatio : 0,
        );
      }

      this.reconcileSelection();
    });

    this.sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (!this.targets.has(entry.target)) continue;
        onSize(entry.target, entry.contentRect.width, entry.contentRect.height);
      }
    });
  }

  register(target: Element): void {
    if (this.targets.has(target)) return;
    this.targets.add(target);
    this.visibility.observe(target);
    this.sizes.observe(target);
  }

  unregister(target: Element): void {
    if (!this.targets.delete(target)) return;
    this.ratios.delete(target);
    this.visibility.unobserve(target);
    this.sizes.unobserve(target);
    if (this.selected === target) this.reconcileSelection();
  }

  disconnect(): void {
    this.visibility.disconnect();
    this.sizes.disconnect();
    this.targets.clear();
    this.ratios.clear();
    this.selected = null;
  }

  private reconcileSelection(): void {
    let selected: Element | null = null;
    let highestRatio = 0;

    for (const [target, ratio] of this.ratios) {
      if (ratio > highestRatio) {
        selected = target;
        highestRatio = ratio;
      }
    }

    if (selected === this.selected) return;
    this.selected = selected;
    this.onSelection(selected);
  }
}
