import type { RgbaColor, RgbaImage } from "./types";

const BACKGROUND_TOLERANCE = 32;

export interface BackgroundRemovalResult {
  image: RgbaImage;
  removedPixelCount: number;
  backgroundColor: { r: number; g: number; b: number } | null;
}

function getPixel(image: RgbaImage, x: number, y: number): RgbaColor {
  const offset = (y * image.width + x) * 4;
  return {
    r: image.data[offset],
    g: image.data[offset + 1],
    b: image.data[offset + 2],
    a: image.data[offset + 3],
  };
}

function colorDistanceSquared(first: RgbaColor, second: RgbaColor): number {
  const red = first.r - second.r;
  const green = first.g - second.g;
  const blue = first.b - second.b;
  return red * red + green * green + blue * blue;
}

function collectBorderSamples(image: RgbaImage): RgbaColor[] {
  const samples: RgbaColor[] = [];
  const step = Math.max(1, Math.floor(Math.max(image.width, image.height) / 128));

  for (let x = 0; x < image.width; x += step) {
    samples.push(getPixel(image, x, 0));
    if (image.height > 1) {
      samples.push(getPixel(image, x, image.height - 1));
    }
  }
  for (let y = step; y < image.height - 1; y += step) {
    samples.push(getPixel(image, 0, y));
    if (image.width > 1) {
      samples.push(getPixel(image, image.width - 1, y));
    }
  }

  return samples;
}

function findBackgroundColor(samples: RgbaColor[]): { r: number; g: number; b: number } | null {
  const opaqueSamples = samples.filter((sample) => sample.a >= 128);
  if (!opaqueSamples.length) {
    return null;
  }

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  opaqueSamples.forEach((sample) => {
    const key = `${Math.round(sample.r / 8)}:${Math.round(sample.g / 8)}:${Math.round(sample.b / 8)}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += sample.r;
    bucket.g += sample.g;
    bucket.b += sample.b;
    buckets.set(key, bucket);
  });

  const dominant = [...buckets.values()].sort((first, second) => second.count - first.count)[0];
  if (!dominant || dominant.count / opaqueSamples.length < 0.2) {
    return null;
  }

  return {
    r: dominant.r / dominant.count,
    g: dominant.g / dominant.count,
    b: dominant.b / dominant.count,
  };
}

function isBackgroundPixel(
  image: RgbaImage,
  x: number,
  y: number,
  backgroundColor: { r: number; g: number; b: number } | null,
): boolean {
  const color = getPixel(image, x, y);
  if (color.a < 128) {
    return true;
  }
  if (!backgroundColor) {
    return false;
  }

  return colorDistanceSquared(color, { ...backgroundColor, a: 255 }) <= BACKGROUND_TOLERANCE ** 2;
}

function enqueueIfBackground(
  image: RgbaImage,
  x: number,
  y: number,
  backgroundColor: { r: number; g: number; b: number } | null,
  visited: Uint8Array,
  queue: Int32Array,
  queueLength: { value: number },
): void {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) {
    return;
  }
  const index = y * image.width + x;
  if (visited[index] || !isBackgroundPixel(image, x, y, backgroundColor)) {
    return;
  }

  visited[index] = 1;
  queue[queueLength.value] = index;
  queueLength.value += 1;
}

/** Removes only background pixels connected to the image border. */
export function removeConnectedBackground(image: RgbaImage): BackgroundRemovalResult {
  if (image.width < 1 || image.height < 1) {
    return { image, removedPixelCount: 0, backgroundColor: null };
  }

  const backgroundColor = findBackgroundColor(collectBorderSamples(image));
  const totalPixels = image.width * image.height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const queueLength = { value: 0 };

  for (let x = 0; x < image.width; x += 1) {
    enqueueIfBackground(image, x, 0, backgroundColor, visited, queue, queueLength);
    enqueueIfBackground(image, x, image.height - 1, backgroundColor, visited, queue, queueLength);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    enqueueIfBackground(image, 0, y, backgroundColor, visited, queue, queueLength);
    enqueueIfBackground(image, image.width - 1, y, backgroundColor, visited, queue, queueLength);
  }

  const output = new Uint8ClampedArray(image.data);
  let removedPixelCount = 0;
  for (let index = 0; index < queueLength.value; index += 1) {
    const pixelIndex = queue[index];
    const x = pixelIndex % image.width;
    const y = Math.floor(pixelIndex / image.width);
    const offset = pixelIndex * 4;
    if (output[offset + 3] >= 128) {
      output[offset + 3] = 0;
      removedPixelCount += 1;
    }

    enqueueIfBackground(image, x - 1, y, backgroundColor, visited, queue, queueLength);
    enqueueIfBackground(image, x + 1, y, backgroundColor, visited, queue, queueLength);
    enqueueIfBackground(image, x, y - 1, backgroundColor, visited, queue, queueLength);
    enqueueIfBackground(image, x, y + 1, backgroundColor, visited, queue, queueLength);
  }

  return {
    image: { ...image, data: output },
    removedPixelCount,
    backgroundColor,
  };
}
