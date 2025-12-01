import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="w-full p-4 fixed top-0 left-0 backdrop-blur-[8px] backdrop-saturate-[100%] bg-opacity-50">
      <Link href="/">
        <h1 className="text-xl hover:underline">ENKODING BLOG</h1>
      </Link>
    </nav>
  );
}
