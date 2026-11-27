import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPost } from "@/lib/posts/repo";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const getPost = cache(getPublishedPost);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  return { title: post?.title };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const html = await renderMarkdown(post.content);

  return (
    <>
      <h1 className="text-2xl font-bold">{post.title}</h1>
      <p className="mb-6 flex gap-3 text-sm">
        <span>{post.date}</span>
        <span>{post.category}</span>
      </p>
      <article
        className="prose dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
