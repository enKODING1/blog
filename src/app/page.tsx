import Link from "next/link";
import { listPublishedPosts } from "@/lib/posts/repo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const posts = await listPublishedPosts();

  if (posts.length === 0) {
    return <p>아직 글이 없습니다.</p>;
  }

  return (
    <ul className="space-y-2">
      {posts.map(post => (
        <li key={post.slug}>
          <Link href={`/posts/${post.slug}`} className="flex gap-3">
            <span>{post.date}</span>
            <span>{post.category}</span>
            <span>{post.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
