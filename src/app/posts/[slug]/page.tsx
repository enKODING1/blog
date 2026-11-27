import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPost } from "@/lib/posts/repo";
import { renderMarkdown } from "@/lib/markdown";
import { isValidSlug } from "@/lib/posts/validate";
import Link from "next/link";
import Scramble from "@/app/_terminal/Scramble";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const getPost = cache(getPublishedPost);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const post = await getPost(slug);
  return { title: post?.title };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const post = await getPost(slug);
  if (!post) notFound();

  const html = await renderMarkdown(post.content);

  return (
    <div className="py-6">
      <p data-line className="text-dim">
        $ cat posts/{slug}.md
      </p>
      <h1
        data-line
        tabIndex={-1}
        className="mt-4 text-2xl font-bold text-fg outline-none"
      >
        <Scramble trigger="mount" text={post.title} />
      </h1>
      <p data-line className="mt-1 text-sm text-dim">
        {post.date} · {post.category}
      </p>
      <article
        data-line
        className="prose prose-invert mt-8 max-w-none font-sans"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <p data-line className="mt-12">
        <Link href="/" className="px-1 hover:term-sel">
          ← cd ..
        </Link>
      </p>
    </div>
  );
}
