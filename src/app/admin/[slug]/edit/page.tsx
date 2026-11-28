import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/session";
import { getPost } from "@/lib/posts/repo";
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
  await requireAdminPage(`/admin/${slug}/edit`);
  const post = await getPost(slug);
  if (!post) notFound();
  const { slug: s, title, category, date, content, status } = post;
  return (
    <PostForm
      mode="update"
      initial={{ slug: s, title, category, date, content, status }}
    />
  );
}
