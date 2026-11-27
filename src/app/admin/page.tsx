import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/session";
import { listAllPosts } from "@/lib/posts/repo";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdminPage("/admin");
  const posts = await listAllPosts();
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr>
          <th className="py-1">날짜</th>
          <th>제목</th>
          <th>상태</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {posts.map(p => (
          <tr key={p.slug}>
            <td className="py-1">{p.date}</td>
            <td>{p.title}</td>
            <td>{p.status === "published" ? "발행" : "초안"}</td>
            <td>
              <Link href={`/admin/${p.slug}/edit`}>편집</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
