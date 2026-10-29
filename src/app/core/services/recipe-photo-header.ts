import { msg } from '../i18n/i18n';
interface PhotoDimensions {
  width: number;
  height: number;
}

// 16 MP bounds one RGBA frame to about 64 MB; 8192 also bounds extreme panoramas.
// These checks run before the browser allocates a decoded bitmap or canvas.
export function assertRecipePhotoDimensions({ width, height }: PhotoDimensions): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16_000_000
  )
    throw new Error(msg('The image dimensions are too large. Choose a smaller photo.'));
}

function invalid(): never {
  throw new Error(msg('The image has an invalid or unsupported JPEG, PNG or WebP header.'));
}
function matches(bytes: Uint8Array, offset: number, values: readonly number[]): boolean {
  return values.every((value, i) => bytes[offset + i] === value);
}
function text(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function dimensions(width: number, height: number): PhotoDimensions {
  const result = { width, height };
  assertRecipePhotoDimensions(result);
  return result;
}

function pngDimensions(bytes: Uint8Array, view: DataView): PhotoDimensions {
  if (
    bytes.length < 33 ||
    !matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]) ||
    view.getUint32(8) !== 13 ||
    text(bytes, 12, 4) !== 'IHDR'
  )
    invalid();
  const depth = bytes[24],
    color = bytes[25];
  const validDepth =
    color === 0
      ? [1, 2, 4, 8, 16].includes(depth)
      : color === 3
        ? [1, 2, 4, 8].includes(depth)
        : [2, 4, 6].includes(color) && [8, 16].includes(depth);
  if (!validDepth || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) invalid();
  return dimensions(view.getUint32(16), view.getUint32(20));
}

function jpegDimensions(bytes: Uint8Array, view: DataView): PhotoDimensions {
  if (!matches(bytes, 0, [255, 216])) invalid();
  let offset = 2;
  let frame: PhotoDimensions | undefined;
  let components = 0;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (
      marker === undefined ||
      marker === 0 ||
      marker === 216 ||
      marker === 217 ||
      marker === 1 ||
      (marker >= 208 && marker <= 215)
    )
      invalid();
    if (offset + 2 > bytes.length) invalid();
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) invalid();
    if ([192, 193, 194].includes(marker)) {
      if (frame || length < 8 || bytes[offset + 2] !== 8) invalid();
      components = bytes[offset + 7];
      if (![1, 3, 4].includes(components) || length !== 8 + 3 * components) invalid();
      frame = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
    } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
      // Unsupported hierarchical/arithmetic/lossless frames need a different decoder contract.
      invalid();
    } else if (marker === 218) {
      const count = bytes[offset + 2];
      if (!frame || count < 1 || count > components || length !== 6 + 2 * count) invalid();
      return frame;
    }
    offset += length;
  }
  return invalid();
}

function webpDimensions(bytes: Uint8Array, view: DataView): PhotoDimensions {
  if (
    bytes.length < 20 ||
    text(bytes, 0, 4) !== 'RIFF' ||
    text(bytes, 8, 4) !== 'WEBP' ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    invalid();
  let offset = 12;
  let canvas: PhotoDimensions | undefined;
  let frame: PhotoDimensions | undefined;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalid();
    const name = text(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end + (length % 2) > bytes.length) invalid();
    if (name === 'VP8X') {
      if (
        offset !== 12 ||
        length !== 10 ||
        (bytes[start] & 0xc3) !== 0 ||
        bytes[start + 1] !== 0 ||
        bytes[start + 2] !== 0 ||
        bytes[start + 3] !== 0
      )
        invalid();
      const uint24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
      canvas = dimensions(uint24(start + 4) + 1, uint24(start + 7) + 1);
      // i18n-ignore: a WebP chunk name
    } else if (name === 'VP8 ') {
      if (
        frame ||
        length < 10 ||
        bytes[start] & 1 ||
        ((bytes[start] >> 1) & 7) > 3 ||
        !matches(bytes, start + 3, [157, 1, 42])
      )
        invalid();
      frame = dimensions(
        view.getUint16(start + 6, true) & 0x3fff,
        view.getUint16(start + 8, true) & 0x3fff,
      );
    } else if (name === 'VP8L') {
      if (frame || length < 5 || bytes[start] !== 47) invalid();
      const bits = view.getUint32(start + 1, true);
      if (bits >>> 29) invalid();
      frame = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    } else if (name === 'ANIM' || name === 'ANMF' || !canvas) {
      // Automatic offline imports accept a single still frame, avoiding animated image work.
      invalid();
    }
    offset = end + (length % 2);
  }
  if (!frame || (canvas && (canvas.width !== frame.width || canvas.height !== frame.height)))
    invalid();
  return frame;
}

// Header inspection is deliberately separate from full decoding: malformed compressed
// pixels still fail in createImageBitmap, after their declared allocation was bounded.
export function readRecipePhotoDimensions(bytes: Uint8Array, type: string): PhotoDimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png') return pngDimensions(bytes, view);
  if (type === 'image/jpeg') return jpegDimensions(bytes, view);
  if (type === 'image/webp') return webpDimensions(bytes, view);
  return invalid();
}
