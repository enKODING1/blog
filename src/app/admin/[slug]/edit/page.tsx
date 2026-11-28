import { notFound } from "next/navigation";
import {
  getSessionToken,
  redirectToLogin,
  requireAdminPage,
  UnauthorizedError,
} from "@/lib/auth/session";
import { getPost } from "@/lib/posts/repo";
import type { Post } from "@/lib/posts/types";
import { isValidSlug } from "@/lib/posts/validate";
import PostForm from "../../PostForm";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const path = `/admin/${slug}/edit`;
  await requireAdminPage(path);
  const token = await getSessionToken();
  if (!token) redirectToLogin(path);
  let post: Post | null;
  try {
    post = await getPost(token, slug);
  } catch (err) {
    // Token expired between the page check and the API's re-check.
    if (err instanceof UnauthorizedError) redirectToLogin(path);
    throw err;
  }
  if (!post) notFound();
  const { slug: s, title, category, date, content, status } = post;
  return (
    <PostForm
      mode="update"
      initial={{ slug: s, title, category, date, content, status }}
    />
  );
}
