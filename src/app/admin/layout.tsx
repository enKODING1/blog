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
      <nav className="mb-6 flex gap-2 border-b border-line py-3 text-sm">
        <Link href="/admin" className="px-1 hover:term-sel">
          글 목록
        </Link>
        <Link href="/admin/new" className="px-1 hover:term-sel">
          새 글
        </Link>
        <a href="/api/auth/logout" className="px-1 text-dim hover:term-sel">
          로그아웃
        </a>
      </nav>
      <div className="pb-6">{children}</div>
    </>
  );
}
