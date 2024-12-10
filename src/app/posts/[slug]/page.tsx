import { getAllPostIds, getPostData } from "../../../../lib/posts";

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
    <div>
      <h1>{title}</h1>
      <p>{date}</p>
      <main className="prose dark:prose-invert" dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}
