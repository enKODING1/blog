"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { renderMarkdown } from "@/lib/markdown";
import { createImageUpload } from "@/lib/media/upload";
import {
  createPost,
  deletePost,
  PostExistsError,
  PostNotFoundError,
  updatePost,
} from "@/lib/posts/repo";
import type { PostInput } from "@/lib/posts/types";
import { validatePostInput } from "@/lib/posts/validate";

export type ActionResult =
  | { ok: true; slug: string }
  | { ok: false; errors: Record<string, string> };

export async function savePost(
  mode: "create" | "update",
  input: PostInput
): Promise<ActionResult> {
  await requireAdmin();

  const validated = validatePostInput(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const post = validated.value;

  try {
    if (mode === "create") {
      await createPost(post);
    } else {
      const { slug, ...rest } = post;
      await updatePost(slug, rest);
    }
  } catch (err) {
    if (err instanceof PostExistsError) {
      return { ok: false, errors: { slug: "이미 있는 주소입니다" } };
    }
    if (err instanceof PostNotFoundError) {
      return { ok: false, errors: { slug: "글을 찾을 수 없습니다" } };
    }
    throw err;
  }

  revalidatePath("/");
  revalidatePath("/posts/" + post.slug);
  return { ok: true, slug: post.slug };
}

export async function removePost(slug: string): Promise<void> {
  await requireAdmin();
  await deletePost(slug);
  revalidatePath("/");
  revalidatePath("/posts/" + slug);
  redirect("/admin");
}

export async function previewMarkdown(md: string): Promise<string> {
  await requireAdmin();
  return renderMarkdown(md);
}

export async function requestImageUpload(
  slug: string,
  contentType: string,
  size: number
): Promise<{ uploadUrl: string; markdownPath: string }> {
  await requireAdmin();
  return createImageUpload({ slug, contentType, size });
}
