/** A minimal baseline JPEG header: enough for dimension parsing and hashing in tests. */
export function testJpeg(width = 640, height = 480, salt = 0): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    ...[255, 216, 255, 225, 0, 4, salt, 0],
    ...[255, 192, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255],
    ...[3, 1, 17, 0, 2, 17, 0, 3, 17, 0],
    ...[255, 218, 0, 12, 3, 1, 0, 2, 17, 3, 17, 0, 63, 0, 0, 255, 217],
  ]);
}
