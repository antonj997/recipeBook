import { tipRecipebookMark, type BrandMarkMotion } from './brand-mark-motion';
import { motionMs } from './motion';
import { t } from './i18n/i18n';

/** The first-paint cover lives outside Angular so it also covers bootstrap and lazy routes. */
export class LaunchScreen {
  private readonly cover: HTMLElement | null;
  private readonly app: HTMLElement | null;
  private readonly logoMotion: BrandMarkMotion;

  constructor(private readonly document: Document) {
    this.cover = document.getElementById('app-launch');
    this.app = document.querySelector('app-root');
    this.logoMotion = tipRecipebookMark(this.cover?.querySelector('.app-launch__logo') ?? null);
    this.translate();
  }

  /** The cover is plain HTML in English; switch its words before the delayed help can show. */
  private translate(): void {
    const set = (selector: string, text: string) => {
      const node = this.cover?.querySelector(selector);
      if (node) node.textContent = text;
    };
    set('.app-launch__label', t('Loading Recipebook…'));
    set('[data-launch-message]', t('Taking longer than expected.'));
    set('.app-launch__help a', t('Reload app'));
  }

  async revealWhen(startup: Promise<unknown>): Promise<void> {
    try {
      await startup;
      if (!this.cover || !this.app) return;
      await this.waitForPage();
      await this.bounded(this.document.fonts?.ready ?? Promise.resolve());
      const images = [...this.app.querySelectorAll('img'), ...this.cover.querySelectorAll('img')];
      await this.bounded(
        Promise.all(
          images
            .filter((image) => this.inViewport(image))
            .map((image) => image.decode().catch(() => undefined)),
        ),
      );
      if (this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.dismiss();
        return;
      }
      // The tip runs during bootstrap; only a fast load waits for its remaining frames.
      await this.logoMotion.finished;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(fallback);
          this.cover?.removeEventListener('transitionend', onEnd);
          this.dismiss();
          resolve();
        };
        const onEnd = (event: TransitionEvent) => {
          if (event.target === this.cover && event.propertyName === 'opacity') finish();
        };
        // transitionend may not fire when a backgrounded app resumes or styles are disabled.
        const fallback = setTimeout(finish, motionMs(220));
        this.cover!.addEventListener('transitionend', onEnd);
        this.cover!.setAttribute('data-ready', '');
      });
    } catch {
      this.logoMotion.cancel();
      this.cover?.setAttribute('data-failed', '');
      const message = this.cover?.querySelector('[data-launch-message]');
      if (message) message.textContent = t('Recipebook could not start.');
      console.error('Recipebook could not start.');
    }
  }

  dismiss(): void {
    this.logoMotion.cancel();
    this.cover?.remove();
    this.document.documentElement.removeAttribute('data-app-loading');
    this.app?.removeAttribute('inert');
    this.app?.removeAttribute('aria-busy');
    if (this.document.activeElement === this.document.body)
      this.document.getElementById('main-content')?.focus({ preventScroll: true });
  }

  private waitForPage(): Promise<void> {
    return new Promise((resolve) => {
      let checking = false;
      const busy = () => this.app?.querySelector('app-loading-state, [aria-busy="true"]');
      const check = () => {
        if (checking || busy()) return;
        checking = true;
        // Allow routing, restored scroll and responsive layout to reach their painted positions.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            checking = false;
            if (busy()) return;
            observer.disconnect();
            resolve();
          }),
        );
      };
      const observer = new MutationObserver(check);
      observer.observe(this.app!, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-busy'],
      });
      check();
    });
  }

  private inViewport(image: HTMLImageElement): boolean {
    const bounds = image.getBoundingClientRect();
    const window = this.document.defaultView;
    return (
      !!window &&
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.bottom > 0 &&
      bounds.right > 0 &&
      bounds.top < window.innerHeight &&
      bounds.left < window.innerWidth &&
      window.getComputedStyle(image).visibility !== 'hidden'
    );
  }

  private async bounded(task: Promise<unknown>): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Broken or stalled optional assets must not prevent access to the cookbook.
      await Promise.race([
        task.catch(() => undefined),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 8000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
