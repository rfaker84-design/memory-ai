import { createHash } from "node:crypto";
import { extname } from "node:path";

import { MediaType } from "./types";

export class MediaValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400
  ) {
    super(message);
  }
}

interface AllowedFormat {
  mediaType: MediaType;
  mime: string;
  extensions: readonly string[];
  canonicalExtension: string;
  matchesSignature(buffer: Buffer): boolean;
}

const startsWith = (buffer: Buffer, bytes: readonly number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

const formats: readonly AllowedFormat[] = [
  {
    mediaType: MediaType.IMAGE,
    mime: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    canonicalExtension: ".jpg",
    matchesSignature: (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  },
  {
    mediaType: MediaType.IMAGE,
    mime: "image/png",
    extensions: [".png"],
    canonicalExtension: ".png",
    matchesSignature: (buffer) =>
      startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mediaType: MediaType.IMAGE,
    mime: "image/webp",
    extensions: [".webp"],
    canonicalExtension: ".webp",
    matchesSignature: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP",
  },
  {
    mediaType: MediaType.AUDIO,
    mime: "audio/mpeg",
    extensions: [".mp3"],
    canonicalExtension: ".mp3",
    matchesSignature: (buffer) =>
      startsWith(buffer, [0x49, 0x44, 0x33]) ||
      (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0),
  },
  {
    mediaType: MediaType.AUDIO,
    mime: "audio/wav",
    extensions: [".wav"],
    canonicalExtension: ".wav",
    matchesSignature: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WAVE",
  },
  {
    mediaType: MediaType.AUDIO,
    mime: "audio/ogg",
    extensions: [".ogg", ".opus"],
    canonicalExtension: ".ogg",
    matchesSignature: (buffer) => startsWith(buffer, [0x4f, 0x67, 0x67, 0x53]),
  },
  {
    mediaType: MediaType.AUDIO,
    mime: "audio/mp4",
    extensions: [".m4a"],
    canonicalExtension: ".m4a",
    matchesSignature: (buffer) =>
      buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp",
  },
];

const executableSignatures: readonly (readonly number[])[] = [
  [0x4d, 0x5a],
  [0x7f, 0x45, 0x4c, 0x46],
  [0xca, 0xfe, 0xba, 0xbe],
  [0x23, 0x21],
];

export interface ValidatedMediaFile {
  body: Buffer;
  mediaType: MediaType;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
}

export interface ValidateMediaOptions {
  maxImageBytes?: number;
  maxAudioBytes?: number;
}

export function validateMediaFile(
  file: { name: string; type: string; body: Buffer },
  options: ValidateMediaOptions = {}
): ValidatedMediaFile {
  if (file.body.length === 0) {
    throw new MediaValidationError("EMPTY_FILE", "The uploaded file is empty");
  }
  if (executableSignatures.some((signature) => startsWith(file.body, signature))) {
    throw new MediaValidationError("EXECUTABLE_FILE", "Executable files are forbidden");
  }

  const extension = extname(file.name).toLowerCase();
  const format = formats.find((candidate) => candidate.mime === file.type.toLowerCase());
  if (!format) {
    throw new MediaValidationError("UNSUPPORTED_MIME", "Unsupported media MIME type");
  }
  if (!format.extensions.includes(extension)) {
    throw new MediaValidationError("INVALID_EXTENSION", "File extension does not match MIME type");
  }
  if (!format.matchesSignature(file.body)) {
    throw new MediaValidationError("INVALID_SIGNATURE", "File signature does not match MIME type");
  }

  const maximum =
    format.mediaType === MediaType.IMAGE
      ? options.maxImageBytes ?? 20 * 1024 * 1024
      : options.maxAudioBytes ?? 100 * 1024 * 1024;
  if (file.body.length > maximum) {
    throw new MediaValidationError("FILE_TOO_LARGE", "The uploaded file exceeds the size limit", 413);
  }

  return {
    body: file.body,
    mediaType: format.mediaType,
    mimeType: format.mime,
    extension: format.canonicalExtension,
    sizeBytes: file.body.length,
    sha256: createHash("sha256").update(file.body).digest("hex"),
  };
}
