/**
 * Hold the page still behind a sheet. iOS lets touches scroll the page under a modal dialog, and
 * scrolls the page instead of the sheet when the keyboard opens; a fixed body stops both. The
 * returned function restores the page and its scroll position.
 */
export function lockPageScroll(document: Document): () => void {
  const win = document.defaultView!;
  const { scrollX: x, scrollY: y } = win;
  const body = document.body;
  const root = document.documentElement;
  const saved = { body: body.style.cssText, root: root.style.overflow };
  root.style.overflow = 'hidden';
  Object.assign(body.style, {
    position: 'fixed',
    top: -y + 'px',
    left: -x + 'px',
    width: '100%',
    overflow: 'hidden',
  });
  return () => {
    body.style.cssText = saved.body;
    root.style.overflow = saved.root;
    win.scrollTo({ left: x, top: y, behavior: 'instant' });
  };
}
