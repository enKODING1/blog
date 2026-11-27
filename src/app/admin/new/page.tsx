import { requireAdminPage } from "@/lib/auth/session";
import PostForm from "../PostForm";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  await requireAdminPage("/admin/new");
  return <PostForm mode="create" />;
}
