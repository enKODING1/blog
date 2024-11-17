import Link from "next/link";
import { getSortedPostsData } from "../../lib/posts";

export default function Home() {
  const allPostsData = getSortedPostsData();
  return (
    <>
      <h1>Blog</h1>
      <ul>
        {allPostsData.map(({ id, title, date }) => {
          return (
            <Link href={`posts/${id}`} key={id}>
              <li>{title}</li>
              <li>{date}</li>
            </Link>
          );
        })}
      </ul>
    </>
  );
}
