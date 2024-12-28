import { getSortedPostsData } from "../../lib/posts";
import PostThumbnail from "./components/PostThumbnail";

export default function Home() {
  const allPostsData = getSortedPostsData();
  return (
    <>
      <ul className={`w-full flex flex-col gap-4`}>
        {allPostsData.map(({ id, title, category, date }) => {
          return (
            <PostThumbnail
              href={`posts/${id}`}
              title={title ?? "Undefined Title"}
              date={date ?? "Undefined Date"}
              category={category ?? "Undefined category"}
              key={id}
            />
          );
        })}
      </ul>
    </>
  );
}
