export interface SnapshotNavigationPress {
  link: HTMLAnchorElement;
  x: number;
  y: number;
}

/** Captured elements cannot hit-test. Remember only a primary press over a stable header link. */
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
  const link = [...header.querySelectorAll<HTMLAnchorElement>('a[href]')].find((anchor) =>
    contains(anchor, event),
  );
  return link ? { link, x: event.clientX, y: event.clientY } : undefined;
}

/** A skipped snapshot can leave the click targeted at <html>. Recover its original link only. */
export function recoverSnapshotNavigation(
  event: MouseEvent,
  press?: SnapshotNavigationPress,
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
