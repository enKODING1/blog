import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/session";
import { listAllPosts } from "@/lib/posts/repo";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdminPage("/admin");
  const posts = await listAllPosts();
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-dim">
        <tr className="border-b border-line">
          <th className="py-1 font-normal">날짜</th>
          <th className="font-normal">제목</th>
          <th className="font-normal">상태</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {posts.map(p => (
          <tr key={p.slug} className="border-b border-line">
            <td className="py-1">{p.date}</td>
            <td>{p.title}</td>
            <td className={p.status === "published" ? "" : "text-dim"}>
              {p.status === "published" ? "발행" : "초안"}
            </td>
            <td>
              <Link
                href={`/admin/${p.slug}/edit`}
                className="px-1 hover:term-sel"
              >
                편집
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
