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
    centerX: width - nx * pull,
    centerY: height - ny * pull,
    angle: (Math.atan2(ny, nx) * 180) / Math.PI,
    length: diagonal * 2,
  };
}

/** A small vector displacement texture, reused for the entire turn. */
export function curlDisplacementMap(nx: number, ny: number): string {
  const peak = 'rgb(' + (128 + 80 * nx) + ',' + (128 + 80 * ny) + ',128)';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-8 -8 16 16">' +
    '<defs><linearGradient id="bend" gradientUnits="userSpaceOnUse" x1="' +
    -2.4 * nx +
    '" y1="' +
    -2.4 * ny +
    '" x2="' +
    0.3 * nx +
    '" y2="' +
    0.3 * ny +
    '">' +
    '<stop offset="0" stop-color="#808080"/><stop offset=".18" stop-color="#808080"/>' +
    '<stop offset=".5" stop-color="' +
    peak +
    '"/><stop offset="1" stop-color="#808080"/>' +
    '</linearGradient></defs><rect x="-8" y="-8" width="16" height="16" fill="url(#bend)"/></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
