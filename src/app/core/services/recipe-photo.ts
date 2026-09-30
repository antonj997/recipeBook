const maxBytes = 20 * 1024 * 1024;
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];

// Both imported and uploaded photos become compact, independent offline copies.
export async function prepareRecipePhoto(blob: Blob, maxSize = 1200): Promise<string> {
  if (!imageTypes.includes(blob.type)) throw new Error('Please select a JPEG, PNG or WebP image.');
  if (blob.size > maxBytes) throw new Error('The image is too large.');
  const bitmap = await createImageBitmap(blob);
  try {
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
): Promise<string> {
  if (!isSupportedRecipePhotoUrl(url)) throw new Error('This photo host is not supported.');
  const response = proxy
    ? await proxy(url)
    : await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
  if (!response.ok) throw new Error('Photo unavailable.');
  if (Number(response.headers.get('content-length')) > maxBytes)
    throw new Error('The image is too large.');
  if (!response.body) throw new Error('Photo unavailable.');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('The image is too large.');
    }
    chunks.push(new Uint8Array(value));
  }
  return prepareRecipePhoto(
    new Blob(chunks, { type: response.headers.get('content-type')?.split(';')[0] }),
    maxSize,
  );
}

const photoHosts = [
  'ica.se',
  'icanet.se',
  'koket.se',
  'arla.se',
  'arla.com',
  'cookwell.com',
  'elinaomickesmat.se',
  'recept.se',
  'kokaihop.se',
  'sanity.io',
  'ctfassets.net',
];
export function isSupportedRecipePhotoUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      photoHosts.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))
    );
  } catch {
    return false;
  }
}
