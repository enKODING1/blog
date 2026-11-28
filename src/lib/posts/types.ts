export type PostStatus = "draft" | "published";

export type PostInput = {
  slug: string;
  title: string;
  category: string;
  date: string;
  content: string;
  status: PostStatus;
};

export type Post = PostInput & { createdAt: string; updatedAt: string };

export type PostSummary = Omit<Post, "content">;
