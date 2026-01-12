/**
 * Image compression utilities using Canvas API
 * 
 * BUHS (MABI's central system) has a 10 MB limit per image.
 * Modern mobile cameras often produce 12-20 MB images.
 * This utility compresses images client-side before upload.
 */

// Constants for different compression levels
const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6 MB (better margin under 10 MB)
const MAX_FILE_SIZE_ABSOLUTE = 25 * 1024 * 1024; // 25 MB absolute max
const RECOMPRESS_THRESHOLD = 8 * 1024 * 1024; // 8 MB - if still above this, recompress

// Standard compression (for files ≤10 MB)
const STANDARD_MAX_DIMENSION = 2048; // pixels (longest side)
const STANDARD_JPEG_QUALITY = 0.80; // 0.0 to 1.0

// Aggressive compression (for files >10 MB)
const AGGRESSIVE_MAX_DIMENSION = 1600; // pixels (longest side)
const AGGRESSIVE_JPEG_QUALITY = 0.65; // lower quality for bigger files

// Very aggressive compression (second pass if needed)
const VERY_AGGRESSIVE_MAX_DIMENSION = 1200; // pixels (longest side)
const VERY_AGGRESSIVE_JPEG_QUALITY = 0.50; // very low quality for stubborn files

/**
 * Compress an image file if needed
 * 
 * @param file - The image file to compress
 * @returns Promise<File | null> - Compressed file, original if no compression needed, or null if file is too large
 * 
 * Logic:
 * - If image is >25 MB → reject with alert and return null
 * - If image is ≤6 MB AND dimensions ≤2048px → return original
 * - If image is >10 MB → use aggressive compression (0.65 quality, 1600px max)
 * - Otherwise → use standard compression (0.80 quality, 2048px max)
 * - If result still >8 MB → compress again with very aggressive settings (0.50 quality, 1200px max)
 * - If compression fails → return original (no blocking)
 * 
 * Note: This function may take a few seconds for large images. 
 * Consider adding UI feedback (spinner/loading state) when calling this function
 * to provide better user experience, especially for images >5 MB.
 */
export async function compressImage(file: File): Promise<File | null> {
  // Only process image files
  if (!file.type.startsWith('image/')) {
    return file;
  }

  try {
    // Reject files that are too large (>25 MB)
    if (file.size > MAX_FILE_SIZE_ABSOLUTE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      alert(`Bilden är för stor (${sizeMB} MB, max 25 MB). Ta ett nytt foto eller välj en mindre bild.`);
      console.error(`File too large: ${file.name} (${formatBytes(file.size)})`);
      return null;
    }

    // Check if file is already small enough
    const needsSizeCompression = file.size > MAX_FILE_SIZE;
    
    // Load image to check dimensions
    const img = await loadImage(file);
    const isLargeFile = file.size > 10 * 1024 * 1024; // >10 MB
    
    // Determine max dimension based on file size
    const maxDimension = isLargeFile ? AGGRESSIVE_MAX_DIMENSION : STANDARD_MAX_DIMENSION;
    const needsDimensionCompression = Math.max(img.width, img.height) > maxDimension;
    
    // If file is already good, return original with preserved extension
    if (!needsSizeCompression && !needsDimensionCompression) {
      console.log(`Image ${file.name} is already optimized (${formatBytes(file.size)}, ${img.width}x${img.height})`);
      return file; // Return original - no compression needed
    }

    // File needs compression - determine compression level
    const quality = isLargeFile ? AGGRESSIVE_JPEG_QUALITY : STANDARD_JPEG_QUALITY;
    console.log(`Compressing image ${file.name} (${formatBytes(file.size)}, ${img.width}x${img.height}) with ${isLargeFile ? 'aggressive' : 'standard'} settings...`);

    // First compression attempt
    let compressedFile = await compressImageWithSettings(img, file, maxDimension, quality);
    
    if (!compressedFile) {
      console.error('Failed to create compressed file');
      return file;
    }

    // If still too large (>8 MB), try very aggressive compression
    if (compressedFile.size > RECOMPRESS_THRESHOLD) {
      console.warn(
        `First compression insufficient (${formatBytes(compressedFile.size)}). ` +
        `Applying very aggressive compression...`
      );
      
      const veryAggressiveFile = await compressImageWithSettings(
        img, 
        file, 
        VERY_AGGRESSIVE_MAX_DIMENSION, 
        VERY_AGGRESSIVE_JPEG_QUALITY
      );
      
      if (veryAggressiveFile) {
        compressedFile = veryAggressiveFile;
      }
    }

    const compressionRatio = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
    console.log(
      `Final compressed ${file.name}: ${formatBytes(file.size)} → ${formatBytes(compressedFile.size)} ` +
      `(${compressionRatio}% reduction)`
    );

    // Final size check
    if (compressedFile.size > MAX_FILE_SIZE) {
      console.warn(
        `Compressed file still exceeds ${formatBytes(MAX_FILE_SIZE)}: ${formatBytes(compressedFile.size)}`
      );
    }

    return compressedFile;

  } catch (error) {
    console.error('Image compression failed, using original:', error);
    return file; // Return original on any error - don't block user
  }
}

/**
 * Compress image with specific settings
 */
async function compressImageWithSettings(
  img: HTMLImageElement,
  originalFile: File,
  maxDimension: number,
  quality: number
): Promise<File | null> {
  try {
    // Calculate new dimensions maintaining aspect ratio
    const { width, height } = calculateNewDimensions(img.width, img.height, maxDimension);

    // Create canvas and draw resized image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get canvas context');
      return null;
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
        quality
      );
    });

    if (!compressedBlob) {
      console.error('Failed to create compressed blob');
      return null;
    }

    // Create new File object from blob
    // Note: Extension changed to .jpg since we're converting to JPEG format
    const compressedFile = new File(
      [compressedBlob],
      originalFile.name.replace(/\.[^.]+$/, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() }
    );

    return compressedFile;
  } catch (error) {
    console.error('Compression with settings failed:', error);
    return null;
  }
}

/**
 * Load an image file and return an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    // Set a timeout to prevent memory leaks from abandoned URLs
    const timeoutId = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error(`Image loading timeout for: ${file.name}`));
    }, 30000); // 30 second timeout

    img.onload = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
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
