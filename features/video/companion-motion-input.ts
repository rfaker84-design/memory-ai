import { createHash } from "node:crypto";

import sharp from "sharp";

export const COMPANION_MOTION_FRAME_WIDTH = 1080;
export const COMPANION_MOTION_FRAME_HEIGHT = 1920;

const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i;

export type CompanionMotionInput = {
  imageDataUrl: string;
  inputSha256: string;
};

/**
 * Makes a private provider-only 9:16 source from an approved owner portrait.
 * The foreground always uses `contain`, so the original photo is never cropped
 * or stretched. A softly blurred copy only fills the newly introduced space.
 */
export async function deriveCompanionMotionInput(
  sourceDataUrl: string,
): Promise<CompanionMotionInput> {
  const match = IMAGE_DATA_URL.exec(sourceDataUrl);
  if (!match) throw new Error("COMPANION_MOTION_INPUT_INVALID");
  const source = Buffer.from(match[1], "base64");
  if (!source.length) throw new Error("COMPANION_MOTION_INPUT_INVALID");

  try {
    const image = sharp(source, {
      animated: false,
      pages: 1,
      limitInputPixels: 40_000_000,
      failOn: "warning",
    }).rotate();
    const [background, foreground] = await Promise.all([
      image.clone()
        .resize({
          width: COMPANION_MOTION_FRAME_WIDTH,
          height: COMPANION_MOTION_FRAME_HEIGHT,
          fit: "cover",
          position: "centre",
        })
        .blur(32)
        .modulate({ brightness: 0.72, saturation: 0.86 })
        .jpeg({ quality: 86, chromaSubsampling: "4:2:0" })
        .toBuffer(),
      image.clone()
        .resize({
          width: COMPANION_MOTION_FRAME_WIDTH,
          height: COMPANION_MOTION_FRAME_HEIGHT,
          fit: "contain",
          position: "centre",
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    ]);
    const body = await sharp(background)
      .composite([{ input: foreground, top: 0, left: 0 }])
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const metadata = await sharp(body).metadata();
    if (
      metadata.width !== COMPANION_MOTION_FRAME_WIDTH
      || metadata.height !== COMPANION_MOTION_FRAME_HEIGHT
    ) {
      throw new Error("COMPANION_MOTION_INPUT_DIMENSIONS_INVALID");
    }
    return {
      imageDataUrl: `data:image/jpeg;base64,${body.toString("base64")}`,
      inputSha256: createHash("sha256").update(body).digest("hex"),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "COMPANION_MOTION_INPUT_DIMENSIONS_INVALID") {
      throw error;
    }
    throw new Error("COMPANION_MOTION_INPUT_DERIVATION_FAILED");
  }
}
