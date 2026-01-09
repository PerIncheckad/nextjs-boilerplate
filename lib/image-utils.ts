/**
 * Image compression utilities using Canvas API
 * 
 * BUHS (MABI's central system) has a 10 MB limit per image.
 * Modern mobile cameras often produce 12-20 MB images.
 * This utility compresses images client-side before upload.
 */

const MAX_DIMENSION = 2048; // pixels (longest side)
const JPEG_QUALITY = 0.80; // 0.0 to 1.0
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB (margin under 10 MB)

/**
 * Compress an image file if needed
 * 
 * @param file - The image file to compress
 * @returns Promise<File> - Compressed file or original if compression not needed/failed
 * 
 * Logic:
 * - If image is ≤8 MB AND dimensions ≤2048px → return original
 * - Otherwise → scale down and compress with Canvas API
 * - If compression fails → return original (no blocking)
 */
export async function compressImage(file: File): Promise<File> {
  // Only process image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  try {
    // Check if file is already small enough
    const needsSizeCompression = file.size > MAX_FILE_SIZE;
    
    // Load image to check dimensions
    const img = await loadImage(file);
    const needsDimensionCompression = Math.max(img.width, img.height) > MAX_DIMENSION;
    
    // If file is already good, return original
    if (!needsSizeCompression && !needsDimensionCompression) {
      console.log(`Image ${file.name} is already optimized (${formatBytes(file.size)}, ${img.width}x${img.height})`);
      return file;
    }

    console.log(`Compressing image ${file.name} (${formatBytes(file.size)}, ${img.width}x${img.height})...`);

    // Calculate new dimensions maintaining aspect ratio
    const { width, height } = calculateNewDimensions(img.width, img.height, MAX_DIMENSION);

    // Create canvas and draw resized image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get canvas context');
      return file;
    }

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw the image at the new size
    ctx.drawImage(img, 0, 0, width, height);

    // Convert canvas to blob
    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        JPEG_QUALITY
      );
    });

    if (!compressedBlob) {
      console.error('Failed to create compressed blob');
      return file;
    }

    // Create new File object from blob
    const compressedFile = new File(
      [compressedBlob],
      file.name.replace(/\.[^.]+$/, '.jpg'), // Change extension to .jpg
      { type: 'image/jpeg', lastModified: Date.now() }
    );

    const compressionRatio = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
    console.log(
      `Compressed ${file.name}: ${formatBytes(file.size)} → ${formatBytes(compressedFile.size)} ` +
      `(${compressionRatio}% reduction, ${width}x${height})`
    );

    // Verify compressed file is under limit
    if (compressedFile.size > MAX_FILE_SIZE) {
      console.warn(
        `Compressed file still exceeds ${formatBytes(MAX_FILE_SIZE)}, ` +
        `but proceeding anyway (${formatBytes(compressedFile.size)})`
      );
    }

    return compressedFile;

  } catch (error) {
    console.error('Image compression failed, using original:', error);
    return file; // Return original on any error - don't block user
  }
}

/**
 * Load an image file and return an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = url;
  });
}

/**
 * Calculate new dimensions while maintaining aspect ratio
 */
function calculateNewDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const aspectRatio = width / height;

  if (width > height) {
    // Landscape or square
    return {
      width: maxDimension,
      height: Math.round(maxDimension / aspectRatio)
    };
  } else {
    // Portrait
    return {
      width: Math.round(maxDimension * aspectRatio),
      height: maxDimension
    };
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
