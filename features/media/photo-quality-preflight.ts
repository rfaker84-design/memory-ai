import sharp from "sharp";

import { MediaValidationError } from "./file-validation";

const PREVIEW_EDGE = 256;
const MINIMUM_SHORT_EDGE = 640;
const MINIMUM_LUMINANCE = 20;
const MAXIMUM_LUMINANCE = 238;
const MINIMUM_CONTRAST = 18;
const MINIMUM_SHARPNESS = 40;

type PhotoQualityFailureReason =
  | "IMAGE_DECODE_FAILED"
  | "IMAGE_DIMENSIONS_TOO_SMALL"
  | "IMAGE_EXPOSURE_UNSUITABLE"
  | "IMAGE_CONTRAST_TOO_LOW"
  | "IMAGE_TOO_BLURRY";

export type PortraitQualityPreflight = {
  version: 1;
  status: "passed" | "failed";
  width?: number;
  height?: number;
  shortEdge?: number;
  luminance?: number;
  contrast?: number;
  sharpness?: number;
  reason?: PhotoQualityFailureReason;
};

export class PhotoQualityPreflightError extends MediaValidationError {
  constructor(
    readonly preflight: PortraitQualityPreflight,
  ) {
    super("PHOTO_REPLACEMENT_REQUIRED", "请更换更清晰照片", 422);
  }
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function failed(
  reason: PhotoQualityFailureReason,
  details: Omit<PortraitQualityPreflight, "version" | "status" | "reason"> = {},
): never {
  throw new PhotoQualityPreflightError({
    version: 1,
    status: "failed",
    reason,
    ...details,
  });
}

/**
 * The single portrait-quality authority shared by formal uploads and video
 * eligibility.  It deliberately evaluates decoded pixels, rather than a
 * client-provided image type, name, or metadata marker.
 */
export async function preflightPortraitPhoto(body: Buffer): Promise<PortraitQualityPreflight> {
  let metadata: { width?: number; height?: number };
  let pixels: Buffer;
  let preview: { width: number; height: number };
  try {
    const image = sharp(body, {
      animated: false,
      pages: 1,
      limitInputPixels: 40_000_000,
      failOn: "warning",
    }).rotate();
    metadata = await image.metadata();
    const result = await image
      .clone()
      .resize({
        width: PREVIEW_EDGE,
        height: PREVIEW_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    pixels = result.data;
    preview = result.info;
  } catch {
    return failed("IMAGE_DECODE_FAILED");
  }

  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) return failed("IMAGE_DECODE_FAILED");
  const shortEdge = Math.min(width, height);
  const dimensions = { width, height, shortEdge };
  if (shortEdge < MINIMUM_SHORT_EDGE) {
    return failed("IMAGE_DIMENSIONS_TOO_SMALL", dimensions);
  }

  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  for (const value of pixels) {
    luminanceSum += value;
    luminanceSquaredSum += value * value;
  }
  const luminance = luminanceSum / pixels.length;
  const contrast = Math.sqrt(Math.max(0, luminanceSquaredSum / pixels.length - luminance * luminance));

  let laplacianSum = 0;
  let laplacianSquaredSum = 0;
  let samples = 0;
  for (let y = 1; y < preview.height - 1; y += 1) {
    for (let x = 1; x < preview.width - 1; x += 1) {
      const index = y * preview.width + x;
      const laplacian = 4 * pixels[index]
        - pixels[index - 1]
        - pixels[index + 1]
        - pixels[index - preview.width]
        - pixels[index + preview.width];
      laplacianSum += laplacian;
      laplacianSquaredSum += laplacian * laplacian;
      samples += 1;
    }
  }
  const sharpness = samples === 0
    ? 0
    : laplacianSquaredSum / samples - (laplacianSum / samples) ** 2;
  const measured = {
    ...dimensions,
    luminance: rounded(luminance),
    contrast: rounded(contrast),
    sharpness: rounded(sharpness),
  };

  if (luminance < MINIMUM_LUMINANCE || luminance > MAXIMUM_LUMINANCE) {
    return failed("IMAGE_EXPOSURE_UNSUITABLE", measured);
  }
  if (contrast < MINIMUM_CONTRAST) return failed("IMAGE_CONTRAST_TOO_LOW", measured);
  if (sharpness < MINIMUM_SHARPNESS) return failed("IMAGE_TOO_BLURRY", measured);

  return { version: 1, status: "passed", ...measured };
}

export function portraitQualityMetadata(preflight: PortraitQualityPreflight): Record<string, unknown> {
  return {
    qualityPreflightStatus: preflight.status,
    qualityPreflight: preflight,
  };
}
