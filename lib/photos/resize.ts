"use client";

import { MAX_INPUT_BYTES, OK_TYPES, fitWithin } from "./shared";

export type PhotoFileProblem = "type" | "too_big" | "unreadable";
export class PhotoFileError extends Error {
  constructor(readonly problem: PhotoFileProblem) {
    super(problem);
  }
}

/**
 * Shrinks a chosen photo on the phone before it uploads: the longer side becomes at most 1280 px, re-encoded as JPEG
 * (quality 0.82). The camera rotation is applied, and a transparent PNG gets a white background. A typical 4 MB
 * camera photo ends up around 200 KB, so a trip's photos stay tiny against the storage allowance.
 */
export async function resizeForUpload(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!OK_TYPES.includes(file.type)) throw new PhotoFileError("type");
  if (file.size > MAX_INPUT_BYTES) throw new PhotoFileError("too_big");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoFileError("unreadable");
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoFileError("unreadable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) throw new PhotoFileError("unreadable");
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

export const PROBLEM_TEXT: Record<PhotoFileProblem, string> = {
  type: "That file isn't a JPEG, PNG or WebP photo.",
  too_big: "That photo is over 30 MB. Pick a smaller one.",
  unreadable: "Couldn't read that photo. Try another one.",
};
