import Separator from "./Separator";

interface PostProps {
  title: string;
  date: string;
  content: string;
}

export default function Post({ title, date, content }: PostProps) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p>{date}</p>
      <Separator style="mb-8"/>
      <main
        className="prose dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
