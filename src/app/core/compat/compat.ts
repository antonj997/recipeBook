/**
 * Small fallbacks for browsers the app still serves but Angular's defaults no longer target,
 * mainly iPads that stop at iPadOS 16 (Safari 16.6).
 */

/** AbortSignal.any (Safari 17.4): aborts as soon as any of the signals does. */
export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const native = (AbortSignal as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof native === 'function') return native.call(AbortSignal, [...signals]);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
      signal: controller.signal,
    });
  }
  return controller.signal;
}

/** The Popover API arrived in Safari 17; without it every menu renders inline on the page. */
export function needsPopoverPolyfill(element: { prototype: object } = HTMLElement): boolean {
  return !('popover' in element.prototype);
}

/** Loads the popover polyfill (its own small chunk) only where the browser lacks popovers. */
export async function applyPopoverPolyfill(): Promise<void> {
  if (!needsPopoverPolyfill()) return;
  const { apply } = await import('@oddbird/popover-polyfill/fn');
  apply();
}

/**
 * Engines older than Safari 17 run on iPads whose GPUs stutter under live blur and SVG
 * displacement; mark the page so those effects give way to opaque surfaces.
 */
export function markLiteEffects(
  root: HTMLElement = document.documentElement,
  element: { prototype: object } = HTMLElement,
): void {
  if (needsPopoverPolyfill(element)) root.classList.add('lite-effects');
}
