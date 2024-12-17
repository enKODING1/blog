import Link from "next/link";
import Chip from "./Chip";

interface PostThumbnailProps {
  title: string;
  date: string;
  category: string;
  href: string;
  style?: string;
}

export default function PostThumbnail({
  title,
  date,
  category,
  href,
  style,
}: PostThumbnailProps) {
  return (
    <Link
      href={href}
      className={`block hover:bg-[rgba(100,100,100,0.2)] border-solid border-inherit p-4 rounded-xl  ${style}`}
    >
      <li>{title}</li>
      <div className="flex flex-row justify-between space-around mt-[4px]">
        <Chip label={category} />
        <li>{date}</li>
      </div>
    </Link>
  );
}
