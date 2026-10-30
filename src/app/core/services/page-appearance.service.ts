import { computed, Service, signal, type Signal } from '@angular/core';

export interface HeaderTitle {
  text: string;
  shown: boolean;
}

// A routed page can tint the shell without changing shared palette tokens.
@Service()
export class PageAppearanceService {
  private readonly color = signal<string | null>(null);
  readonly background = this.color.asReadonly();
  private owner?: symbol;
  private readonly browserTint = signal<string | null>(null);
  readonly browserColor = this.browserTint.asReadonly();
  private browserOwner?: symbol;
  // iOS tints the status bar from what lies behind a top-layer view, so the locked page takes the
  // overlay's surface too; the recipe color itself stays put for when the overlay closes.
  readonly pageBackground = computed(() => this.browserTint() ?? this.color());

  // Top-layer views can tint browser chrome without changing the recipe palette.
  useBrowserColor(color: string): () => void {
    const owner = Symbol();
    this.browserOwner = owner;
    this.browserTint.set(color);
    return () => {
      if (this.browserOwner !== owner) return;
      this.browserOwner = undefined;
      this.browserTint.set(null);
    };
  }

  // The compact header can carry the page title once the page's own heading has scrolled away.
  private readonly titleSource = signal<Signal<HeaderTitle | null> | null>(null);
  readonly headerTitle = computed(() => this.titleSource()?.() ?? null);
  private readonly headerSize = signal(0);
  readonly headerHeight = this.headerSize.asReadonly();

  setHeaderHeight(height: number): void {
    this.headerSize.set(height);
  }

  useHeaderTitle(title: Signal<HeaderTitle | null>): () => void {
    this.titleSource.set(title);
    return () => {
      if (this.titleSource() === title) this.titleSource.set(null);
    };
  }

  useBackground(color: string): () => void {
    const owner = Symbol();
    this.owner = owner;
    this.color.set(color);
    return () => {
      if (this.owner !== owner) return;
      this.owner = undefined;
      this.color.set(null);
    };
  }
}
