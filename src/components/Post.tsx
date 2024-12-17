import Chip from "./Chip";
import Separator from "./Separator";

interface PostProps {
  title: string;
  date: string;
  category: string;
  content: string;
}

export default function Post({ title, date, category, content }: PostProps) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-row">
        <p>{date}&nbsp;</p>
        <Chip label={category} />
      </div>
      <Separator style="mb-8" />
      <main
        className="prose dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
