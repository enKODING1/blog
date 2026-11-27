import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3 } from "@/lib/aws";
import { getDataConfig } from "@/lib/config";
import { SLUG_PATTERN } from "@/lib/posts/validate";

// SVG is deliberately excluded: it can carry scripts.
export const ALLOWED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function createImageUpload(p: {
  slug: string;
  contentType: string;
  size: number;
}): Promise<{ uploadUrl: string; markdownPath: string }> {
  if (typeof p.slug !== "string" || !SLUG_PATTERN.test(p.slug)) {
    throw new Error("Invalid slug");
  }
  const ext = Object.hasOwn(ALLOWED_IMAGE_TYPES, p.contentType)
    ? ALLOWED_IMAGE_TYPES[p.contentType]
    : undefined;
  if (!ext) throw new Error("Unsupported image type");
  if (!Number.isInteger(p.size) || p.size <= 0 || p.size > MAX_IMAGE_BYTES) {
    throw new Error("Invalid image size");
  }

  const key = `posts/${p.slug}/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    getS3(),
    new PutObjectCommand({
      Bucket: getDataConfig().mediaBucket,
      Key: key,
      ContentType: p.contentType,
      ContentLength: p.size,
    }),
    {
      expiresIn: 300,
      signableHeaders: new Set(["content-type", "content-length"]),
    }
  );
  return { uploadUrl, markdownPath: "/media/" + key };
}
