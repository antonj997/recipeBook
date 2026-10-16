/** Read-only layout measurements. The controller applies all temporary styles afterwards. */
export function titleLayout(element: HTMLElement, window: Window) {
  const computed = window.getComputedStyle(element);
  const font = parseFloat(computed.fontSize);
  if (!(font > 0) || !element.offsetWidth || !element.offsetHeight) return null;
  return {
    font,
    width: parseFloat(computed.width) || element.offsetWidth,
    height: parseFloat(computed.height) || element.offsetHeight,
  };
}

/** Native snapshots lose ancestor clipping. Retain the corners touching a clipped edge. */
export function visibleCorners(
  element: HTMLElement,
  image: boolean,
  window: Window,
  boundary: HTMLElement | null,
): string {
  const properties = [
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'borderBottomLeftRadius',
  ] as const;
  const style = window.getComputedStyle(element);
  const corners = properties.map((property) => style[property]);
  const bounds = layoutBounds(element);
  const touches = (a: number, b: number) => Math.abs(a - b) < 1;
  let parent = image ? element.parentElement : null;
  while (parent && parent !== boundary) {
    const outerStyle = window.getComputedStyle(parent);
    if (
      ['hidden', 'clip'].includes(outerStyle.overflowX) ||
      ['hidden', 'clip'].includes(outerStyle.overflowY)
    ) {
      const outer = layoutBounds(parent);
      const borders = [
        outerStyle.borderTopWidth,
        outerStyle.borderRightWidth,
        outerStyle.borderBottomWidth,
        outerStyle.borderLeftWidth,
      ].map((width) => parseFloat(width) || 0);
      const edge = {
        top: outer.top + borders[0],
        right: outer.right - borders[1],
        bottom: outer.bottom - borders[2],
        left: outer.left + borders[3],
      };
      const matches = [
        touches(bounds.top, edge.top) && touches(bounds.left, edge.left),
        touches(bounds.top, edge.top) && touches(bounds.right, edge.right),
        touches(bounds.bottom, edge.bottom) && touches(bounds.right, edge.right),
        touches(bounds.bottom, edge.bottom) && touches(bounds.left, edge.left),
      ];
      properties.forEach((property, index) => {
        const inset = Math.max(borders[index], borders[(index + 3) % 4]);
        const radius = Math.max(0, parseFloat(outerStyle[property]) - inset);
        if (matches[index] && radius > parseFloat(corners[index])) corners[index] = radius + 'px';
      });
    }
    parent = parent.parentElement;
  }
  return corners.join(' ');
}

/** Use layout edges before perspective tilt, whose projected bounds distort corner alignment. */
function layoutBounds(element: HTMLElement) {
  let left = 0,
    top = 0;
  let offset: HTMLElement | null = element;
  while (offset) {
    left += offset.offsetLeft;
    top += offset.offsetTop;
    offset = offset.offsetParent as HTMLElement | null;
    if (offset) {
      left += offset.clientLeft;
      top += offset.clientTop;
    }
  }
  return { left, top, right: left + element.offsetWidth, bottom: top + element.offsetHeight };
}

export function expansionOrigin(
  element: HTMLElement,
  window: Window,
  width: number,
  returning: boolean,
) {
  const bounds = element.getBoundingClientRect();
  const colorSource =
    element.querySelector<HTMLElement>('.index-image') ??
    element.closest<HTMLElement>('.recipe-intro') ??
    element;
  const color = window.getComputedStyle(colorSource).backgroundColor;
  const inset = (rect: DOMRect) => {
    const clamp = (value: number, limit: number) => Math.max(0, Math.min(limit, value));
    return [
      clamp(rect.top, window.innerHeight),
      width - clamp(rect.right, width),
      window.innerHeight - clamp(rect.bottom, window.innerHeight),
      clamp(rect.left, width),
    ]
      .map((value) => value + 'px')
      .join(' ');
  };
  const strip = returning ? null : element.querySelector<HTMLElement>('.index-color');
  return {
    color,
    inset: inset(bounds),
    stripInset: strip ? inset(strip.getBoundingClientRect()) : null,
  };
}
