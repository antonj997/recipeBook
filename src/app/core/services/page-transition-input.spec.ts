import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureSnapshotNavigation,
  recoverSnapshotNavigation,
  observeSnapshotGesture,
  advanceSnapshotFocus,
} from './page-transition-input';

describe('navigation intent through a native snapshot', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });
  function fixture(className = 'back-link') {
    document.body.innerHTML =
      '<header><a href="/">Home</a></header><main id="main-content"><a href="/" class="' +
      className +
      '">Recipe</a></main>';
    const header = document.querySelector('header')!;
    const link = document.querySelector<HTMLAnchorElement>('main a')!;
    vi.spyOn(link, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 100, 200, 80));
    const event = {
      target: document.documentElement,
      isTrusted: true,
      isPrimary: true,
      button: 0,
      clientX: 80,
      clientY: 140,
      detail: 1,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent;
    return { header, link, event };
  }
  it('recovers a visible Back link as navigation intent during a snapshot', () => {
    const { header, link, event } = fixture();
    const press = captureSnapshotNavigation(event, header);
    expect(press?.link).toBe(link);
    const click = vi.spyOn(link, 'click').mockImplementation(() => undefined);
    recoverSnapshotNavigation(event, press);
    expect(click).toHaveBeenCalledOnce();
  });
  it('does not recover a card from its final bounds underneath a moving snapshot', () => {
    const { header, event } = fixture('recipe-card');
    expect(captureSnapshotNavigation(event, header)).toBeUndefined();
  });
  it('never activates controls that are still waiting to appear', () => {
    const { header, link, event } = fixture();
    link.parentElement!.inert = true;
    link.parentElement!.setAttribute('inert', '');
    expect(captureSnapshotNavigation(event, header)).toBeUndefined();
  });
  it('does not recover a navigation click after a drag', () => {
    const { header, link, event } = fixture();
    const press = captureSnapshotNavigation(event, header);
    const click = vi.spyOn(link, 'click').mockImplementation(() => undefined);
    recoverSnapshotNavigation(
      {
        ...event,
        target: document.documentElement,
        clientX: 110,
        clientY: 140,
        isTrusted: true,
        button: 0,
        detail: 1,
      } as unknown as MouseEvent,
      press,
    );
    expect(click).not.toHaveBeenCalled();
  });
  it('does not interfere with modified clicks or ordinary live DOM clicks', () => {
    const { header, link, event } = fixture();
    expect(
      captureSnapshotNavigation({ ...event, ctrlKey: true } as PointerEvent, header),
    ).toBeUndefined();
    expect(
      captureSnapshotNavigation({ ...event, target: link } as PointerEvent, header),
    ).toBeUndefined();
  });
});

describe('snapshot gesture takeover', () => {
  function press() {
    return {
      target: document.documentElement,
      isPrimary: true,
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    } as unknown as PointerEvent;
  }
  function send(type: string, x = 100, pointerId = 1) {
    const event = new MouseEvent(type, { clientX: x, clientY: 100 });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    document.dispatchEvent(event);
  }
  it('lets a simple press complete without cancelling the motion', () => {
    const cancel = vi.fn();
    const stop = observeSnapshotGesture(document, press(), cancel);
    send('pointerup');
    send('pointercancel');
    expect(cancel).not.toHaveBeenCalled();
    stop();
  });
  it('yields when the browser takes over a native pan before another pointer move', () => {
    const cancel = vi.fn();
    const stop = observeSnapshotGesture(document, press(), cancel);
    send('pointercancel');
    send('pointercancel');
    expect(cancel).toHaveBeenCalledOnce();
    stop();
  });
  it('ignores other pointers and yields once a real drag crosses the threshold', () => {
    const cancel = vi.fn();
    const stop = observeSnapshotGesture(document, press(), cancel);
    send('pointermove', 150, 2);
    send('pointermove', 105);
    expect(cancel).not.toHaveBeenCalled();
    send('pointermove', 120);
    send('pointermove', 140);
    expect(cancel).toHaveBeenCalledOnce();
    stop();
  });
});

describe('preserved keyboard intent after snapshot cleanup', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });
  function fixture() {
    document.body.innerHTML =
      '<header><a href="/">Home</a><a href="/settings">Settings</a></header>' +
      '<main tabindex="-1"><a href="/">Back</a><button disabled>Unavailable</button>' +
      '<div inert><button>Hidden control</button></div><button>Options</button></main>';
    for (const element of document.querySelectorAll<HTMLElement>('a, button'))
      vi.spyOn(element, 'getClientRects').mockReturnValue([
        new DOMRect(0, 0, 80, 44),
      ] as unknown as DOMRectList);
    document.querySelector<HTMLElement>('main')!.focus();
  }
  it('continues forward from route focus without skipping the first recipe control', () => {
    fixture();
    advanceSnapshotFocus(document, false);
    expect(document.activeElement?.textContent).toBe('Back');
    advanceSnapshotFocus(document, false);
    expect(document.activeElement?.textContent).toBe('Options');
  });
  it('preserves reverse traversal from route focus', () => {
    fixture();
    advanceSnapshotFocus(document, true);
    expect(document.activeElement?.textContent).toBe('Settings');
  });
});
