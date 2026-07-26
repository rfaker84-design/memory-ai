export type PhotoQualityCode =
  | "ready"
  | "unsupported"
  | "too-large"
  | "too-small"
  | "too-dark"
  | "too-bright"
  | "low-contrast"
  | "soft-focus"
  | "unreadable";

export type PhotoQualityMetrics = {
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  sharpness: number;
};

export type PhotoQualityResult = {
  accepted: boolean;
  code: PhotoQualityCode;
  title: string;
  guidance: string;
  metrics?: PhotoQualityMetrics;
};

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MIN_PHOTO_EDGE = 480;

export function judgePhotoQuality(metrics: PhotoQualityMetrics): PhotoQualityResult {
  const shortestEdge = Math.min(metrics.width, metrics.height);

  if (shortestEdge < MIN_PHOTO_EDGE) {
    return {
      accepted: false,
      code: "too-small",
      title: "这张照片稍微有些小",
      guidance: "换一张更清晰的原图，会更容易看见 TA 的神情。",
      metrics,
    };
  }

  if (metrics.brightness < 30) {
    return {
      accepted: false,
      code: "too-dark",
      title: "这张照片里的光有些暗",
      guidance: "试试光线更柔和、脸部更清楚的一张，我们会在这里等你。",
      metrics,
    };
  }

  if (metrics.brightness > 232) {
    return {
      accepted: false,
      code: "too-bright",
      title: "这张照片的亮部有些看不清",
      guidance: "换一张没有强烈反光或过曝的照片，会保留更多熟悉的细节。",
      metrics,
    };
  }

  if (metrics.contrast < 14) {
    return {
      accepted: false,
      code: "low-contrast",
      title: "这张照片的轮廓还不够清楚",
      guidance: "可以换一张人物与背景区分更明显的照片。",
      metrics,
    };
  }

  if (metrics.sharpness < 5.8) {
    return {
      accepted: false,
      code: "soft-focus",
      title: "我们暂时还看不清 TA",
      guidance: "请换一张对焦更清楚、人物没有被遮挡的正面照片。",
      metrics,
    };
  }

  return {
    accepted: true,
    code: "ready",
    title: "这张照片可以继续",
    guidance: "接下来不会先展示静态确认图，我们会直接让这段影像慢慢出现。",
    metrics,
  };
}

export function validatePhotoFile(file: File): PhotoQualityResult | null {
  if (!file.type.startsWith("image/")) {
    return {
      accepted: false,
      code: "unsupported",
      title: "这不是我们能读取的照片",
      guidance: "请选择 JPG、PNG、HEIC 或 WebP 等常见图片。",
    };
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return {
      accepted: false,
      code: "too-large",
      title: "这张照片有些大",
      guidance: "请选择 20MB 以内的原图，画面内容不会因此被保存。",
    };
  }

  return null;
}

export async function assessPhotoFile(file: File): Promise<PhotoQualityResult> {
  const fileIssue = validatePhotoFile(file);
  if (fileIssue) return fileIssue;

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);
    const sampleWidth = Math.min(bitmap.width, 240);
    const sampleHeight = Math.max(1, Math.round(bitmap.height * (sampleWidth / bitmap.width)));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) throw new Error("CANVAS_UNAVAILABLE");

    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
    const luminance = new Float32Array(sampleWidth * sampleHeight);
    let total = 0;

    for (let pixel = 0, index = 0; pixel < data.length; pixel += 4, index += 1) {
      const value = data[pixel] * 0.2126 + data[pixel + 1] * 0.7152 + data[pixel + 2] * 0.0722;
      luminance[index] = value;
      total += value;
    }

    const brightness = total / luminance.length;
    let contrastTotal = 0;
    let sharpnessTotal = 0;
    let sharpnessSamples = 0;

    for (let y = 1; y < sampleHeight - 1; y += 1) {
      for (let x = 1; x < sampleWidth - 1; x += 1) {
        const index = y * sampleWidth + x;
        const delta = luminance[index] - brightness;
        contrastTotal += delta * delta;
        const laplacian = Math.abs(
          luminance[index - 1]
          + luminance[index + 1]
          + luminance[index - sampleWidth]
          + luminance[index + sampleWidth]
          - luminance[index] * 4
        );
        sharpnessTotal += laplacian;
        sharpnessSamples += 1;
      }
    }

    const metrics: PhotoQualityMetrics = {
      width: bitmap.width,
      height: bitmap.height,
      brightness,
      contrast: Math.sqrt(contrastTotal / Math.max(1, sharpnessSamples)),
      sharpness: sharpnessTotal / Math.max(1, sharpnessSamples),
    };

    return judgePhotoQuality(metrics);
  } catch {
    return {
      accepted: false,
      code: "unreadable",
      title: "这张照片暂时没有打开",
      guidance: "可以重新选择一张原图，我们不会上传刚才的文件。",
    };
  } finally {
    bitmap?.close();
  }
}
