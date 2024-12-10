import { getAllPostIds, getPostData } from "../../../../lib/posts";
import Post from "../../../components/Post";

export async function generateStaticParams() {
  const posts = getAllPostIds();
  return posts.map((post) => ({ slug: post }));
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const id = (await params).slug;
  const { title, date, content } = await getPostData(id);

  return (
    <>
      <Post
        title={title ?? "Undefined Title"}
        date={date ?? "Undefined Date"}
        content={content}
      />
    </>
  );
}
