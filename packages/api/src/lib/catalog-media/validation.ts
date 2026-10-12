import { randomUUID } from "node:crypto";
import { z } from "@medusajs/framework/zod";
import { MedusaError } from "@medusajs/framework/utils";
import type { CreateFileDTO } from "@medusajs/framework/types";

export const MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CATALOG_IMAGES = 6;
export const MAX_CATALOG_IMAGE_BASE64_LENGTH = 4 * Math.ceil(MAX_CATALOG_IMAGE_BYTES / 3);
export const CatalogImageMimeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);
export const CatalogImageUploadSchema = z.strictObject({
  files: z.array(z.strictObject({
    filename: z.string().trim().min(1).max(160),
    mime_type: CatalogImageMimeSchema,
    content: z.string().min(1).max(MAX_CATALOG_IMAGE_BASE64_LENGTH),
  })).min(1).max(MAX_CATALOG_IMAGES).refine(files => files.reduce((total, file) => total + file.content.length / 4 * 3 - (file.content.endsWith("==") ? 2 : file.content.endsWith("=") ? 1 : 0), 0) <= MAX_CATALOG_IMAGE_BYTES, "Upload at most 5 MiB of image content per request."),
});
export type CatalogImageUpload = z.infer<typeof CatalogImageUploadSchema>;

const invalid = (): never => { throw new MedusaError(MedusaError.Types.INVALID_DATA, "Use PNG, JPEG or WebP image files up to 5 MiB each."); };

export function validateCatalogImageContent(content: string, mimeType: string): Buffer {
  if (!CatalogImageMimeSchema.safeParse(mimeType).success || !content || content.length > MAX_CATALOG_IMAGE_BASE64_LENGTH || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) invalid();
  const bytes = Buffer.from(content, "base64");
  if (!bytes.length || bytes.length > MAX_CATALOG_IMAGE_BYTES || bytes.toString("base64") !== content) invalid();
  if (mimeType === "image/png") {
    if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) invalid();
    let offset = 8;
    let hasImageData = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (offset + size + 12 > bytes.length) invalid();
      if (offset === 8 && (type !== "IHDR" || size !== 13 || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20))) invalid();
      if (type === "IDAT" && size) hasImageData = true;
      offset += size + 12;
      if (type === "IEND") {
        if (size !== 0 || offset !== bytes.length || !hasImageData) invalid();
        return bytes;
      }
    }
    invalid();
  }
  if (mimeType === "image/jpeg") {
    if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) invalid();
    let offset = 2;
    let hasFrame = false;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) invalid();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (offset + 2 > bytes.length) invalid();
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length - 2) invalid();
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (size < 8 || !bytes.readUInt16BE(offset + 3) || !bytes.readUInt16BE(offset + 5)) invalid();
        hasFrame = true;
      }
      if (marker === 0xda) { if (!hasFrame || size < 6 || offset + size >= bytes.length - 2) invalid(); return bytes; }
      offset += size;
    }
    invalid();
  }
  if (bytes.length < 26 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length - 8) invalid();
  let offset = 12;
  let hasImage = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (size === 0 || offset + 8 + size > bytes.length) invalid();
    if (type === "VP8 " && size >= 10 && bytes.subarray(offset + 11, offset + 14).equals(Buffer.from([0x9d, 0x01, 0x2a]))) hasImage = true;
    if (type === "VP8L" && size >= 5 && bytes[offset + 8] === 0x2f) hasImage = true;
    // An animation frame must contain a recognized image bitstream, not just an ANMF label.
    if (type === "ANMF" && size > 24) {
      let frameOffset = offset + 24;
      const frameEnd = offset + 8 + size;
      while (frameOffset + 8 <= frameEnd) {
        const frameType = bytes.toString("ascii", frameOffset, frameOffset + 4);
        const frameSize = bytes.readUInt32LE(frameOffset + 4);
        if (!frameSize || frameOffset + 8 + frameSize > frameEnd) invalid();
        if (frameType === "VP8 " && frameSize >= 10 && bytes.subarray(frameOffset + 11, frameOffset + 14).equals(Buffer.from([0x9d, 0x01, 0x2a]))) hasImage = true;
        if (frameType === "VP8L" && frameSize >= 5 && bytes[frameOffset + 8] === 0x2f) hasImage = true;
        frameOffset += 8 + frameSize + frameSize % 2;
      }
      if (frameOffset !== frameEnd) invalid();
    }
    offset += 8 + size + (size % 2);
  }
  if (offset !== bytes.length || !hasImage) invalid();
  return bytes;
}

export function prepareCatalogImages(body: unknown): (CreateFileDTO & { access: "public" })[] {
  const { files } = CatalogImageUploadSchema.parse(body);
  return files.map(file => {
    validateCatalogImageContent(file.content, file.mime_type);
    const extension = file.mime_type === "image/jpeg" ? "jpg" : file.mime_type.split("/")[1];
    return { filename: `${randomUUID()}.${extension}`, mimeType: file.mime_type, content: file.content, access: "public" };
  });
}
