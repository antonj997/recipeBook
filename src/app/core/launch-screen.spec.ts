import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LaunchScreen } from './launch-screen';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('launch screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.setAttribute('data-app-loading', '');
    document.body.innerHTML = `<app-root inert aria-busy="true"><main id="main-content" tabindex="-1"></main></app-root>
      <div id="app-launch" role="status"><span>Loading Recipebook…</span><a href="">Reload app</a></div>`;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-app-loading');
  });

  it('keeps the app covered until startup and the initial page loader both finish', async () => {
    const startup = deferred();
    const loader = document.createElement('app-loading-state');
    document.querySelector('main')!.append(loader);
    const launch = new LaunchScreen(document);
    const done = launch.revealWhen(startup.promise);
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById('app-launch')?.hasAttribute('data-ready')).toBe(false);
    startup.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById('app-launch')?.hasAttribute('data-ready')).toBe(false);
    loader.remove();
    await vi.advanceTimersByTimeAsync(40);
    expect(document.getElementById('app-launch')?.hasAttribute('data-ready')).toBe(true);
    expect(document.querySelector('app-root')?.hasAttribute('inert')).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    await done;
    expect(document.getElementById('app-launch')).toBeNull();
    expect(document.documentElement.hasAttribute('data-app-loading')).toBe(false);
    expect(document.querySelector('app-root')?.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('app-root')?.hasAttribute('aria-busy')).toBe(false);
    expect(document.activeElement?.id).toBe('main-content');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for visible photos to decode before revealing the page', async () => {
    const decoded = deferred();
    const image = document.createElement('img');
    image.decode = () => decoded.promise;
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 200, 160));
    document.querySelector('main')!.append(image);
    const done = new LaunchScreen(document).revealWhen(Promise.resolve());
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById('app-launch')?.hasAttribute('data-ready')).toBe(false);
    decoded.resolve();
    await vi.advanceTimersByTimeAsync(250);
    await done;
    expect(document.getElementById('app-launch')).toBeNull();
  });

  it('does not wait for offscreen lazy photos', async () => {
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.decode = () => new Promise(() => undefined);
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 10000, 200, 160));
    document.querySelector('main')!.append(image);
    const done = new LaunchScreen(document).revealWhen(Promise.resolve());
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(document.getElementById('app-launch')).toBeNull();
  });

  it('allows a failed photo to fall back instead of trapping the app', async () => {
    const image = document.createElement('img');
    image.decode = () => Promise.reject(new Error('Image unavailable'));
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 200, 160));
    document.querySelector('main')!.append(image);
    const done = new LaunchScreen(document).revealWhen(Promise.resolve());
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(document.getElementById('app-launch')).toBeNull();
  });

  it('does not stay covered forever if a visible photo never settles', async () => {
    const image = document.createElement('img');
    image.decode = () => new Promise(() => undefined);
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 200, 160));
    document.querySelector('main')!.append(image);
    const done = new LaunchScreen(document).revealWhen(Promise.resolve());
    await vi.advanceTimersByTimeAsync(10000);
    await done;
    expect(document.getElementById('app-launch')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for an explicitly busy section and notices when it becomes ready', async () => {
    const section = document.createElement('section');
    section.setAttribute('aria-busy', 'true');
    document.querySelector('main')!.append(section);
    const done = new LaunchScreen(document).revealWhen(Promise.resolve());
    await vi.advanceTimersByTimeAsync(500);
    expect(document.getElementById('app-launch')?.hasAttribute('data-ready')).toBe(false);
    section.setAttribute('aria-busy', 'false');
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(document.getElementById('app-launch')).toBeNull();
  });

  it('keeps a recoverable launch screen if bootstrap fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await new LaunchScreen(document).revealWhen(Promise.reject(new Error('Bootstrap failed')));
    expect(document.getElementById('app-launch')?.hasAttribute('data-failed')).toBe(true);
    expect(document.getElementById('app-launch')?.querySelector('a')?.hasAttribute('href')).toBe(
      true,
    );
    expect(document.querySelector('app-root')?.hasAttribute('inert')).toBe(true);
  });

  it('releases the cover immediately for reduced motion after the page is ready', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const done = new LaunchScreen(document).revealWhen(Promise.resolve());
    await vi.advanceTimersByTimeAsync(40);
    await done;
    expect(document.getElementById('app-launch')).toBeNull();
  });
});
