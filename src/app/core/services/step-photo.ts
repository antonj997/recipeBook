// Step photos are independent local copies, like the main recipe photo.
export async function downloadStepPhoto(url: string): Promise<string> {
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Step photo unavailable');
  if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024)
    throw new Error('Step photo too large');
  const blob = await response.blob();
  if (
    blob.size > 20 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)
  )
    throw new Error('Unsupported step photo');
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process step photo');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.7);
    if (data.length > 1_500_000) throw new Error('Step photo too large');
    return data;
  } finally {
    bitmap.close();
  }
}
