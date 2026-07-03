/**
 * Local image analysis — no OCR models, no external services, no uploads.
 *
 * Two cheap on-device signals cover most of what reverse image search would:
 * 1. Catalog-style detection: retailer product photos (Amazon, Wayfair,
 *    Temu…) are product-on-pure-white — Amazon requires #FFFFFF
 *    backgrounds. Real marketplace photos are rooms, floors, and garages.
 *    A white border ring with a non-white subject is a strong copy-paste
 *    tell, computed from a 24×24 downscale.
 * 2. Perceptual hash (dHash): the same photo reused across distinct
 *    listings is a repost-flood/scam tell that survives price rotation and
 *    JPEG re-encodes. 64-bit difference hash from a 9×8 grayscale.
 *
 * Everything runs on-device via OffscreenCanvas. Cross-origin CDN images
 * that refuse CORS simply yield no signal (fail open).
 */

export type PixelGrid = {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
};

export type ImageAnalysis = {
  hash: string;
  catalogStyle: boolean;
};

const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;
const CLASSIFY_SIZE = 24;

function luma(data: PixelGrid["data"], offset: number): number {
  return 0.299 * (data[offset] ?? 0) + 0.587 * (data[offset + 1] ?? 0) + 0.114 * (data[offset + 2] ?? 0);
}

/** 64-bit difference hash from a 9×8 RGBA grid, as 16 hex chars. */
export function dhashFromPixels(grid: PixelGrid): string {
  let hash = "";
  let nibble = 0;
  let bits = 0;

  for (let y = 0; y < DHASH_HEIGHT; y += 1) {
    for (let x = 0; x < DHASH_WIDTH - 1; x += 1) {
      const left = luma(grid.data, (y * grid.width + x) * 4);
      const right = luma(grid.data, (y * grid.width + x + 1) * 4);
      nibble = (nibble << 1) | (left < right ? 1 : 0);
      bits += 1;
      if (bits === 4) {
        hash += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }

  return hash;
}

export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  for (let index = 0; index < hashA.length; index += 1) {
    let xor = Number.parseInt(hashA[index] ?? "0", 16) ^ Number.parseInt(hashB[index] ?? "0", 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/** Hashes within this distance count as the same source photo. */
export const SAME_IMAGE_DISTANCE = 6;

/**
 * Catalog-style = near-pure-white border ring around a real subject.
 * All-white/blank frames (placeholders, unloaded tiles) return false —
 * there is no subject to sell.
 */
export function isCatalogStylePixels(grid: PixelGrid): boolean {
  const { width, height, data } = grid;
  if (width < 8 || height < 8) {
    return false;
  }

  const ring = Math.max(1, Math.floor(Math.min(width, height) * 0.12));
  let ringPixels = 0;
  let ringWhite = 0;
  let interiorPixels = 0;
  let interiorNonWhite = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      const nearWhite = r >= 243 && g >= 243 && b >= 243 && Math.max(r, g, b) - Math.min(r, g, b) <= 12;
      const inRing = x < ring || y < ring || x >= width - ring || y >= height - ring;

      if (inRing) {
        ringPixels += 1;
        if (nearWhite) {
          ringWhite += 1;
        }
      } else {
        interiorPixels += 1;
        if (!nearWhite) {
          interiorNonWhite += 1;
        }
      }
    }
  }

  const ringWhiteRatio = ringPixels === 0 ? 0 : ringWhite / ringPixels;
  const subjectRatio = interiorPixels === 0 ? 0 : interiorNonWhite / interiorPixels;

  return ringWhiteRatio >= 0.92 && subjectRatio >= 0.08;
}

type CacheEntry = ImageAnalysis | null;

export type ImageScanner = {
  /** Queue an image URL for analysis (deduped, capped). */
  request(url: string): void;
  /** Analysis result if available; undefined if pending/unanalyzable. */
  get(url: string): ImageAnalysis | undefined;
  has(url: string): boolean;
};

const MAX_CACHE = 800;
const CONCURRENCY = 3;

export function createImageScanner(onResult: () => void): ImageScanner {
  const cache = new Map<string, CacheEntry>();
  const queue: string[] = [];
  const queued = new Set<string>();
  let active = 0;

  async function analyze(url: string): Promise<CacheEntry> {
    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!response.ok) {
        return null;
      }

      const bitmap = await createImageBitmap(await response.blob());
      try {
        const classify = drawToGrid(bitmap, CLASSIFY_SIZE, CLASSIFY_SIZE);
        const hashGrid = drawToGrid(bitmap, DHASH_WIDTH, DHASH_HEIGHT);
        if (!classify || !hashGrid) {
          return null;
        }

        return {
          hash: dhashFromPixels(hashGrid),
          catalogStyle: isCatalogStylePixels(classify)
        };
      } finally {
        bitmap.close();
      }
    } catch {
      // CORS refusal, decode failure, network error: no signal.
      return null;
    }
  }

  function drawToGrid(bitmap: ImageBitmap, width: number, height: number): PixelGrid | null {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    return { data: imageData.data, width, height };
  }

  function pump(): void {
    while (active < CONCURRENCY) {
      const url = queue.shift();
      if (url === undefined) {
        return;
      }
      queued.delete(url);

      if (cache.has(url)) {
        continue;
      }

      active += 1;
      void analyze(url).then((result) => {
        if (cache.size >= MAX_CACHE) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) {
            cache.delete(oldest);
          }
        }
        cache.set(url, result);
        active -= 1;
        if (result) {
          onResult();
        }
        pump();
      });
    }
  }

  return {
    request(url: string): void {
      if (!url || cache.has(url) || queued.has(url)) {
        return;
      }

      queued.add(url);
      queue.push(url);
      pump();
    },

    get(url: string): ImageAnalysis | undefined {
      return cache.get(url) ?? undefined;
    },

    has(url: string): boolean {
      return cache.has(url);
    }
  };
}
