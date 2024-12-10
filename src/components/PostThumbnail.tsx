import Link from "next/link";

interface PostThumbnailProps {
  title: string;
  date: string;
  href: string;
  style?: string;
}

export default function PostThumbnail({
  title,
  date,
  href,
  style,
}: PostThumbnailProps) {
  return (
    <Link
      href={href}
      className={`block border-2 border-solid border-inherit p-4 rounded  ${style}`}
    >
      <li>{title}</li>
      <li>{date}</li>
    </Link>
  );
}
