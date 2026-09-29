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

export async function downloadRecipePhoto(url: string, maxSize = 1200): Promise<string> {
  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Photo unavailable.');
  if (Number(response.headers.get('content-length')) > maxBytes)
    throw new Error('The image is too large.');
  return prepareRecipePhoto(await response.blob(), maxSize);
}
