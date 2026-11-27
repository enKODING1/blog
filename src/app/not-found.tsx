import Link from "next/link";
import NotFoundPath from "./_terminal/NotFoundPath";

export default function NotFound() {
  return (
    <div className="py-6">
      <p data-line className="text-error">
        <NotFoundPath />
      </p>
      <p data-line className="mt-4">
        <Link href="/" className="px-1 hover:term-sel">
          ← cd ~
        </Link>
      </p>
    </div>
  );
}
