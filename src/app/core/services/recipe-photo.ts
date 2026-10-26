import { assertRecipePhotoDimensions, readRecipePhotoDimensions } from './recipe-photo-header';

const maxBytes = 20 * 1024 * 1024;
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];

// Both imported and uploaded photos become compact, independent offline copies.
export async function prepareRecipePhoto(blob: Blob, maxSize = 1200): Promise<string> {
  if (!imageTypes.includes(blob.type)) throw new Error('Please select a JPEG, PNG or WebP image.');
  if (blob.size > maxBytes) throw new Error('The image is too large.');
  readRecipePhotoDimensions(new Uint8Array(await blob.arrayBuffer()), blob.type);
  const bitmap = await createImageBitmap(blob);
  try {
    assertRecipePhotoDimensions(bitmap);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process the image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', maxSize === 800 ? 0.7 : 0.75);
    if (result.length > 1_500_000)
      throw new Error('The processed image is too large. Choose a smaller photo.');
    return result;
  } finally {
    bitmap.close();
  }
}

export async function downloadRecipePhoto(
  url: string,
  maxSize = 1200,
  proxy?: (url: string) => Promise<Response>,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (!isSupportedRecipePhotoUrl(url)) throw new Error('This photo URL is not supported.');
  const downloadSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
    : AbortSignal.timeout(10_000);
  const response = proxy
    ? await proxy(url)
    : await fetch(new URL('api/import', document.baseURI), {
        method: 'POST',
        mode: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'photo', url }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: downloadSignal,
      });
  if (!response.ok) throw new Error('Photo unavailable.');
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (!imageTypes.includes(type) || Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error(imageTypes.includes(type) ? 'The image is too large.' : 'Photo unavailable.');
  }
  if (!response.body) throw new Error('Photo unavailable.');
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  downloadSignal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  try {
    if (downloadSignal.aborted) {
      cancel();
      downloadSignal.throwIfAborted();
    }
    let size = 0;
    while (true) {
      downloadSignal.throwIfAborted();
      const { done, value } = await reader.read();
      downloadSignal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('The image is too large.');
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    downloadSignal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  downloadSignal.throwIfAborted();
  const photo = await prepareRecipePhoto(new Blob(chunks, { type }), maxSize);
  downloadSignal.throwIfAborted();
  return photo;
}

// This is a browser syntax check. The importer authoritatively resolves and pins
// public addresses on every hop; the browser never requests these URLs directly.
export function isSupportedRecipePhotoUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^https:\/\//i.test(value) ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    const labels = host.split('.');
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      host.length <= 253 &&
      host !== 'home.arpa' &&
      !host.endsWith('.home.arpa') &&
      labels.length >= 2 &&
      !/^\d+(?:\.\d+){3}$/.test(host) &&
      labels.every(
        (label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      ) &&
      !/^(?:\d+|localhost|local|localdomain|internal|home|lan|onion|test|invalid|example)$/.test(
        labels.at(-1)!,
      )
    );
  } catch {
    return false;
  }
}
