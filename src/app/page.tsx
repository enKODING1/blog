import { listPublishedPosts } from "@/lib/posts/repo";
import { TransitionLink } from "@/app/_terminal/TransitionProvider";
import Scramble from "./_terminal/Scramble";
import ListKeyboardNav from "./_terminal/ListKeyboardNav";

export const dynamic = "force-dynamic";

export default async function Home() {
  const posts = await listPublishedPosts();

  return (
    <div className="py-6">
      {/* Focus target after a transition; not a data-line. */}
      <h1 tabIndex={-1} className="sr-only">
        글 목록
      </h1>
      <p data-line className="text-dim">
        $ ls posts --sort=date
      </p>
      {posts.length === 0 ? (
        <p data-line className="mt-2">
          아직 글이 없습니다.
        </p>
      ) : (
        <ListKeyboardNav>
          <ul className="mt-2">
            {posts.map((post, i) => (
              <li key={post.slug} data-line data-index={i} className="group">
                <TransitionLink
                  href={`/posts/${post.slug}`}
                  className="grid grid-cols-[auto_1fr] gap-x-4 px-1 hover:term-sel group-focus-within:term-sel sm:grid-cols-[auto_auto_1fr]"
                >
                  <span className="text-dim">{post.date}</span>
                  <span className="text-accent">{post.category}</span>
                  <Scramble
                    trigger="hover"
                    text={post.title}
                    className="col-span-2 sm:col-span-1"
                  />
                </TransitionLink>
              </li>
            ))}
          </ul>
        </ListKeyboardNav>
      )}
    </div>
  );
}
