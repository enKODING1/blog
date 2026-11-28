import { listPublishedPosts } from "@/lib/posts/repo";
import { TransitionLink } from "@/app/_terminal/TransitionProvider";
import Scramble from "./_terminal/Scramble";
import ListKeyboardNav from "./_terminal/ListKeyboardNav";

export const dynamic = "force-dynamic";

/** "2025-12-01" → "2025.12" */
function yearMonth(date: string): string {
  return date.slice(0, 7).replace("-", ".");
}

export default async function Home() {
  const posts = await listPublishedPosts();

  return (
    <div className="py-8">
      {/* Focus target after a transition; not a data-line. */}
      <h1 tabIndex={-1} className="sr-only">
        글 목록
      </h1>
      {posts.length === 0 ? (
        <p data-line className="text-dim">
          아직 글이 없습니다.
        </p>
      ) : (
        <ListKeyboardNav>
          <ul>
            {posts.map((post, i) => (
              <li key={post.slug} data-line data-index={i} className="group">
                <TransitionLink
                  href={`/posts/${post.slug}`}
                  className="flex items-baseline justify-between gap-10 border-b border-rule py-[18px] transition-[padding] duration-200 group-hover:pl-[10px] focus-visible:pl-[10px] focus-visible:outline-none motion-reduce:transition-none"
                >
                  <span className="min-w-0 font-sans text-[15px] leading-snug">
                    <span
                      aria-hidden="true"
                      className="mr-1 hidden text-accent group-hover:inline group-focus-within:inline"
                    >
                      ›
                    </span>
                    <Scramble trigger="hover" text={post.title} />
                  </span>
                  <time
                    dateTime={post.date}
                    className="shrink-0 text-[11px] text-faint group-hover:text-dim group-focus-within:text-dim"
                  >
                    {yearMonth(post.date)}
                  </time>
                </TransitionLink>
              </li>
            ))}
          </ul>
        </ListKeyboardNav>
      )}
    </div>
  );
}
