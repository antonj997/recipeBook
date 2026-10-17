export interface SnapshotNavigationPress {
  link: HTMLAnchorElement;
  x: number;
  y: number;
}

/** Recover only stationary navigation. Moving snapshots can cover final card bounds. */
export function captureSnapshotNavigation(
  event: PointerEvent,
  header?: HTMLElement,
): SnapshotNavigationPress | undefined {
  if (
    !header ||
    event.target !== header.ownerDocument.documentElement ||
    !event.isTrusted ||
    !event.isPrimary ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const candidates = [
    ...header.querySelectorAll<HTMLAnchorElement>('a[href]'),
    ...header.ownerDocument.querySelectorAll<HTMLAnchorElement>('#main-content a.back-link'),
  ];
  const link = candidates.find((anchor) => {
    if (!contains(anchor, event) || anchor.closest('[inert], [aria-hidden="true"], [hidden]'))
      return false;
    const style = header.ownerDocument.defaultView?.getComputedStyle(anchor);
    return style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
  });
  return link ? { link, x: event.clientX, y: event.clientY } : undefined;
}

/** A skipped snapshot can leave the click targeted at <html>. Recover its original link only. */
export function recoverSnapshotNavigation(
  event: MouseEvent,
  press?: SnapshotNavigationPress,
  beforeNavigate?: () => void,
): void {
  if (
    !press ||
    !press.link.isConnected ||
    event.target !== press.link.ownerDocument.documentElement ||
    !event.isTrusted ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.detail < 1 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10 ||
    !contains(press.link, event)
  )
    return;
  event.preventDefault();
  // Reuse RouterLink and its guards. This untrusted click cannot recurse here.
  beforeNavigate?.();
  press.link.click();
}

function contains(link: HTMLAnchorElement, event: MouseEvent): boolean {
  const bounds = link.getBoundingClientRect();
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom
  );
}

/** Observe only a press on the native snapshot; ordinary page input is untouched. */
export function observeSnapshotGesture(
  document: Document,
  press: PointerEvent,
  onCancel: () => void,
): () => void {
  if (press.target !== document.documentElement || !press.isPrimary || press.button !== 0)
    return () => {};
  const move = (event: PointerEvent) => {
    if (
      event.pointerId !== press.pointerId ||
      Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) <= 10
    )
      return;
    cancel(event);
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId !== press.pointerId) return;
    stop();
    onCancel();
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId === press.pointerId) stop();
  };
  const stop = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
  };
  // Native pan/pinch can send pointercancel before any move crosses the threshold.
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerup', up, { passive: true });
  document.addEventListener('pointercancel', cancel, { passive: true });
  return stop;
}

/** Continue the interrupted Tab in normal DOM order once snapshot controls are live. */
export function advanceSnapshotFocus(document: Document, backwards: boolean): void {
  const current = document.activeElement;
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      'a[href], button, input, textarea, select, [tabindex]',
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
      element.getClientRects().length > 0 &&
      document.defaultView?.getComputedStyle(element).visibility !== 'hidden',
  );
  if (backwards) candidates.reverse();
  const relation = backwards ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  const next =
    candidates.find(
      (element) => current && !!(current.compareDocumentPosition(element) & relation),
    ) ?? candidates[0];
  next?.focus({ preventScroll: true });
}
