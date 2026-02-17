/**
 * Image compression utilities using Canvas API
 * 
 * BUHS (MABI's central system) has a 10 MB limit per image.
 * Modern mobile cameras often produce 12-20 MB images (including HEIC from iPhones).
 * This utility compresses images client-side before upload.
 * 
 * Strategy:
 * - Target: ≤4 MB (safe margin under BUHS 10 MB limit)
 * - Max dimension: 1600px (plenty for damage documentation)
 * - Iterative quality reduction if first pass isn't enough
 * - HEIC/HEIF: handled via createImageBitmap (works in modern browsers)
 *   with canvas fallback for older browsers
 */

const TARGET_SIZE = 8 * 1024 * 1024;       // 4 MB target (safe margin)
const MAX_FILE_SIZE_ABSOLUTE = 50 * 1024 * 1024; // 50 MB absolute reject
const MAX_DIMENSION = 4032;                  // px longest side (enough for damage photos)
const INITIAL_QUALITY = 0.92;                // Starting JPEG quality
const MIN_QUALITY = 0.50;                    // Floor — don't go below this
const QUALITY_STEP = 0.10;                   // Reduce by this each iteration

/**
 * Compress an image file to ≤4 MB, 1600px max dimension.
 * 
 * @param file - The image file to compress
 * @returns Compressed file, or null if rejected (too large / unsupported)
 * 
 * If compression fails for any reason, returns the original file
 * so the user is never blocked from submitting.
 */
export async function compressImage(file: File): Promise<File | null> {
  // Only process image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  try {
    // Reject absurdly large files
    if (file.size > MAX_FILE_SIZE_ABSOLUTE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      alert(`Bilden är för stor (${sizeMB} MB, max 50 MB). Ta ett nytt foto eller välj en mindre bild.`);
      console.error(`[compress] Rejected: ${file.name} (${formatBytes(file.size)})`);
      return null;
    }

    // If already under target AND is JPEG/PNG (not HEIC), check dimensions
    if (file.size <= TARGET_SIZE && !isHeic(file)) {
      const img = await loadImageSafe(file);
      if (img && Math.max(img.width, img.height) <= MAX_DIMENSION) {
        console.log(`[compress] Already optimized: ${file.name} (${formatBytes(file.size)}, ${img.width}×${img.height})`);
        return file;
      }
      // Dimensions too large — fall through to compress
    }

    // Load the image (handles HEIC via createImageBitmap)
    const img = await loadImageSafe(file);
    if (!img) {
      console.warn(`[compress] Could not load image: ${file.name} — returning original`);
      return file;
    }

    // Calculate target dimensions
    const { width, height } = scaleDimensions(img.width, img.height, MAX_DIMENSION);

    // Draw onto canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[compress] No canvas context');
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // Iteratively reduce quality until under target
    let quality = INITIAL_QUALITY;
    let blob: Blob | null = null;

    while (quality >= MIN_QUALITY) {
      blob = await canvasToBlob(canvas, quality);
      if (!blob) {
        console.error('[compress] toBlob returned null');
        return file;
      }
      if (blob.size <= TARGET_SIZE) {
        break; // Success
      }
      console.log(`[compress] ${formatBytes(blob.size)} at quality ${quality.toFixed(2)} — reducing...`);
      quality -= QUALITY_STEP;
    }

    if (!blob) {
      return file;
    }

    // Build compressed File object
    const compressedFile = new File(
      [blob],
      file.name.replace(/\.[^.]+$/, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() }
    );

    const ratio = ((1 - compressedFile.size / file.size) * 100).toFixed(0);
    console.log(
      `[compress] ${file.name}: ${formatBytes(file.size)} → ${formatBytes(compressedFile.size)} ` +
      `(−${ratio}%, quality=${quality.toFixed(2)}, ${width}×${height})`
    );

    if (compressedFile.size > TARGET_SIZE) {
      console.warn(`[compress] Still above target after max compression: ${formatBytes(compressedFile.size)}`);
    }

    return compressedFile;

  } catch (error) {
    console.error('[compress] Unexpected error, returning original:', error);
    return file;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if file is HEIC/HEIF (common on iPhones) */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === '' || // iOS sometimes sends empty MIME for HEIC
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

/**
 * Load image safely — tries createImageBitmap first (handles HEIC in
 * Safari/Chrome), falls back to HTMLImageElement via object URL.
 * Returns the drawable source, or null on failure.
 */
async function loadImageSafe(file: File): Promise<HTMLImageElement | ImageBitmap | null> {
  // Try createImageBitmap first (better HEIC support)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return bitmap;
    } catch {
      // Fall through to <img> method
      console.log('[compress] createImageBitmap failed, trying <img> fallback');
    }
  }

  // Fallback: load via <img> + object URL
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      console.warn('[compress] Image load timeout');
      resolve(null);
    }, 30_000);

    img.onload = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      console.warn(`[compress] <img> failed to load: ${file.name}`);
      resolve(null);
    };
    img.src = url;
  });
}

/** Promisified canvas.toBlob */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/** Scale dimensions to fit within maxDimension, preserving aspect ratio */
function scaleDimensions(
  w: number,
  h: number,
  maxDim: number
): { width: number; height: number } {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  const ratio = w / h;
  if (w > h) {
    return { width: maxDim, height: Math.round(maxDim / ratio) };
  }
  return { width: Math.round(maxDim * ratio), height: maxDim };
}

/** Format bytes as human-readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
