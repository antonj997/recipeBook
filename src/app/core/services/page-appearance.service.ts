import { Service, signal } from '@angular/core';

// A routed page can tint the shell without changing shared palette tokens.
@Service()
export class PageAppearanceService {
  private readonly color = signal<string | null>(null);
  readonly background = this.color.asReadonly();
  private owner?: symbol;
  private readonly browserTint = signal<string | null>(null);
  readonly browserColor = this.browserTint.asReadonly();
  private browserOwner?: symbol;

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
