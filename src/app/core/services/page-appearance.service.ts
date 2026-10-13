import { Service, signal } from '@angular/core';

// A routed page can tint the shell without changing shared palette tokens.
@Service()
export class PageAppearanceService {
  private readonly color = signal<string | null>(null);
  readonly background = this.color.asReadonly();
  private owner?: symbol;

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
