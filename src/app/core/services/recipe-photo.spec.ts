import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadRecipePhoto, isSupportedRecipePhotoUrl, prepareRecipePhoto } from './recipe-photo';

function png(width = 640, height = 480): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 2, 0, 0, 0], 24);
  return bytes;
}
function jpeg(width = 640, height = 480): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    255,
    216,
    255,
    225,
    0,
    4,
    0,
    0,
    255,
    192,
    0,
    17,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    1,
    17,
    0,
    2,
    17,
    0,
    3,
    17,
    0,
    255,
    218,
    0,
    12,
    3,
    1,
    0,
    2,
    17,
    3,
    17,
    0,
    63,
    0,
    0,
    255,
    217,
  ]);
}
function webpChunk(name: string, data: number[]): number[] {
  const length = data.length;
  return [
    ...Array.from(name, (c) => c.charCodeAt(0)),
    length,
    0,
    0,
    0,
    ...data,
    ...(length % 2 ? [0] : []),
  ];
}
function webp(
  width = 640,
  height = 480,
  lossless = false,
  canvas?: [number, number],
): Uint8Array<ArrayBuffer> {
  const chunks: number[] = [];
  if (canvas) {
    const [w, h] = canvas.map((value) => value - 1);
    chunks.push(
      ...webpChunk('VP8X', [
        0,
        0,
        0,
        0,
        w & 255,
        (w >> 8) & 255,
        w >> 16,
        h & 255,
        (h >> 8) & 255,
        h >> 16,
      ]),
    );
  }
  if (lossless) {
    const bits = (width - 1) | ((height - 1) << 14);
    chunks.push(
      ...webpChunk('VP8L', [47, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, bits >>> 24]),
    );
  } else {
    chunks.push(
      ...webpChunk('VP8 ', [
        0,
        0,
        0,
        157,
        1,
        42,
        width & 255,
        width >> 8,
        height & 255,
        height >> 8,
      ]),
    );
  }
  const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, ...chunks]);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  return bytes;
}
function blob(bytes: Uint8Array<ArrayBuffer>, type: string): Blob {
  return new Blob([bytes], { type });
}

describe('recipe photo headers before bitmap decoding', () => {
  const decode = vi.fn();
  const close = vi.fn();
  beforeEach(() => {
    decode.mockReset().mockResolvedValue({ width: 640, height: 480, close });
    close.mockReset();
    vi.stubGlobal('createImageBitmap', decode);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: () => {},
      drawImage: () => {},
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,offline',
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['PNG', png(), 'image/png'],
    ['JPEG', jpeg(), 'image/jpeg'],
    ['lossy WebP', webp(), 'image/webp'],
    ['lossless WebP', webp(640, 480, true), 'image/webp'],
    ['extended WebP', webp(640, 480, false, [640, 480]), 'image/webp'],
  ])('re-encodes a bounded %s photo as an independent JPEG', async (_name, bytes, type) => {
    expect(await prepareRecipePhoto(blob(bytes as Uint8Array<ArrayBuffer>, type as string))).toBe(
      'data:image/jpeg;base64,offline',
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ['PNG over the side limit', png(8193, 1), 'image/png'],
    ['PNG over the pixel limit', png(5000, 4000), 'image/png'],
    ['zero PNG width', png(0, 480), 'image/png'],
    ['JPEG over the side limit', jpeg(8193, 1), 'image/jpeg'],
    ['JPEG over the pixel limit', jpeg(5000, 4000), 'image/jpeg'],
    ['WebP over the side limit', webp(8193, 1), 'image/webp'],
    ['lossless WebP over the pixel limit', webp(5000, 4000, true), 'image/webp'],
    [
      'extended WebP oversized frame behind a small canvas',
      webp(8193, 1, false, [640, 480]),
      'image/webp',
    ],
    ['extended WebP oversized canvas', webp(640, 480, false, [5000, 4000]), 'image/webp'],
  ])('rejects %s without invoking the decoder', async (_name, bytes, type) => {
    await expect(
      prepareRecipePhoto(blob(bytes as Uint8Array<ArrayBuffer>, type as string)),
    ).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });

  it.each([
    ['PNG mislabeled as JPEG', png(), 'image/jpeg'],
    ['JPEG mislabeled as WebP', jpeg(), 'image/webp'],
    [
      'SVG mislabeled as PNG',
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image/png',
    ],
    ['truncated PNG IHDR', png().slice(0, 31), 'image/png'],
    ['truncated JPEG frame', jpeg().slice(0, 25), 'image/jpeg'],
    ['JPEG scan before frame', new Uint8Array([255, 216, 255, 218, 0, 2]), 'image/jpeg'],
    ['truncated WebP chunk', webp().slice(0, 28), 'image/webp'],
  ])('rejects %s before image decoding', async (_name, bytes, type) => {
    await expect(
      prepareRecipePhoto(blob(bytes as Uint8Array<ArrayBuffer>, type as string)),
    ).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects animated WebP before decoding additional frames', async () => {
    const bytes = webp(640, 480, false, [640, 480]);
    bytes[20] = 2;
    await expect(prepareRecipePhoto(blob(bytes, 'image/webp'))).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects malformed PNG compression and JPEG segment lengths before decoding', async () => {
    const image = png();
    image[26] = 1;
    const photo = jpeg();
    photo[5] = 1;
    await expect(prepareRecipePhoto(blob(image, 'image/png'))).rejects.toThrow();
    await expect(prepareRecipePhoto(blob(photo, 'image/jpeg'))).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });

  it('closes a bitmap that reports dimensions beyond the header bounds', async () => {
    decode.mockResolvedValue({ width: 10000, height: 10000, close });
    await expect(prepareRecipePhoto(blob(png(), 'image/png'))).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('public recipe photo URLs', () => {
  it.each([
    'https://photos.new-recipe-site.com/food.png',
    'https://cdn.xn--bcher-kva.de/photo.webp',
  ])('accepts a standard HTTPS URL on %s', (url) => {
    expect(isSupportedRecipePhotoUrl(url)).toBe(true);
  });
  it.each([
    'http://photos.example.com/a.jpg',
    'https://person:secret@photos.example.com/a.jpg',
    'https://photos.example.com:444/a.jpg',
    'https://127.0.0.1/a.jpg',
    'https://2130706433/a.jpg',
    'https://0x7f000001/a.jpg',
    'https://[::1]/a.jpg',
    'https://localhost/a.jpg',
    'https://printer.local/a.jpg',
    'https://router.home.arpa/a.jpg',
    'https:photos.example.com/a.jpg',
    'https://service.internal/a.jpg',
    'https://intranet/a.jpg',
    'https://bad_name.example.com/a.jpg',
    ' https://photos.example.com/a.jpg',
  ])('rejects non-public or non-standard destination %s', (url) => {
    expect(isSupportedRecipePhotoUrl(url)).toBe(false);
  });
});

describe('proxied recipe photo downloads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('posts foreign URLs to the same-origin importer without requesting the foreign host', async () => {
    const requests: { url: URL; options?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (input: string | URL, options?: RequestInit) => {
      requests.push({ url: new URL(String(input), document.baseURI), options });
      return new Response('unavailable', { status: 404 });
    });
    await expect(
      downloadRecipePhoto('https://photos.new-recipe-site.com/food.jpg'),
    ).rejects.toThrow();
    expect(requests).toHaveLength(1);
    expect(requests[0].url.href).toBe(new URL('api/import', document.baseURI).href);
    expect(requests[0].url.origin).toBe(location.origin);
    expect(requests[0].options?.method).toBe('POST');
    expect(JSON.parse(String(requests[0].options?.body))).toEqual({
      action: 'photo',
      url: 'https://photos.new-recipe-site.com/food.jpg',
    });
    expect(requests[0].options?.redirect).toBe('error');
    expect(requests[0].options?.mode).toBe('same-origin');
  });

  it('uses the authenticated photo proxy when supplied', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const proxy = vi.fn(async () => new Response('unavailable', { status: 404 }));
    await expect(
      downloadRecipePhoto('https://photos.new-recipe-site.com/food.jpg', 1200, proxy),
    ).rejects.toThrow('Photo unavailable');
    expect(proxy).toHaveBeenCalledWith('https://photos.new-recipe-site.com/food.jpg');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels a response stream as soon as it exceeds 20 MiB', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(20 * 1024 * 1024));
        controller.enqueue(new Uint8Array(1));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      downloadRecipePhoto(
        'https://www.ica.se/food.jpg',
        1200,
        async () => new Response(body, { headers: { 'content-type': 'image/jpeg' } }),
      ),
    ).rejects.toThrow('too large');
    expect(cancelled).toBe(true);
  });

  it('cancels a stalled proxy response when the import is cancelled', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const proxy = async () => new Response(body, { headers: { 'content-type': 'image/jpeg' } });
    const pending = downloadRecipePhoto(
      'https://www.ica.se/food.jpg',
      1200,
      proxy,
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
});
