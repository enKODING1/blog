import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage("/admin");
  return (
    <>
      <nav className="mb-6 flex gap-4 text-sm">
        <Link href="/admin">글 목록</Link>
        <Link href="/admin/new">새 글</Link>
        <a href="/api/auth/logout">로그아웃</a>
      </nav>
      {children}
    </>
  );
}
