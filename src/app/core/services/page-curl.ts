export const PAGE_CURL_DURATION = 550;

/** Geometry of a sheet lifted from the lower-right corner, in viewport pixels. */
export function pageCurl(width: number, height: number, progress: number) {
  const diagonal = Math.hypot(width, height);
  const nx = height / diagonal;
  const ny = width / diagonal;
  const amount = Math.max(0, Math.min(1, progress));
  const lift = amount === 0 || amount === 1 ? 0 : Math.sin(Math.PI * amount);
  const distance = (nx * width + ny * height) * (1 - amount);
  const radius = Math.min(140, Math.max(48, width * 0.16)) * lift;
  const foldWidth = radius * 0.85;
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const right = clamp(distance / nx, width);
  const bottom = clamp(distance / ny, height);
  // Clip against nx*x + ny*y <= distance, retaining the top-left of the sheet.
  const outline = [
    [0, 0],
    [right, 0],
    [right, clamp((distance - nx * width) / ny, height)],
    [clamp((distance - ny * height) / nx, width), bottom],
    [0, bottom],
  ];
  const pull = nx * width + ny * height - distance;
  return {
    nx,
    ny,
    distance,
    radius,
    foldWidth,
    clip: outline,
    // The incoming sheet is visible only where the outgoing sheet has lifted.
    reveal: [[width, 0], [width, height], [0, height], ...outline.slice(1).reverse()],
    centerX: width - nx * pull,
    centerY: height - ny * pull,
    angle: (Math.atan2(ny, nx) * 180) / Math.PI,
    length: diagonal * 2,
  };
}
