import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="p-4">
      <Link href="/">
        <h1 className="text-xl hover:underline">ENKODING BLOG</h1>
      </Link>
    </nav>
  );
}