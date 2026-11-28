import { apiRequest } from "@/lib/api/client";
import { throwIfUnauthorized } from "@/lib/api/lambda-error";

// Client-side pre-check only; the API enforces the same rules.
// SVG is deliberately excluded: it can carry scripts.
export const ALLOWED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ImageUpload = { uploadUrl: string; markdownPath: string };

export async function createImageUpload(
  token: string,
  p: { slug: string; contentType: string; size: number }
): Promise<ImageUpload> {
  const res = await apiRequest<ImageUpload>("POST", "/admin/uploads", {
    body: p,
    userToken: token,
  });
  throwIfUnauthorized(res);
  if (res.status === 400) throw new Error("Invalid image upload");
  if (res.status === 200 && res.body) return res.body;
  throw new Error(`API ${res.status}`);
}
