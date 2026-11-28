import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", async orig => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  requireAdmin: vi.fn(),
  requireAdminToken: vi.fn(),
}));
vi.mock("@/lib/posts/repo", async orig => ({
  ...(await orig<typeof import("@/lib/posts/repo")>()),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
}));
vi.mock("@/lib/markdown", () => ({ renderMarkdown: vi.fn() }));
vi.mock("@/lib/media/upload", async orig => ({
  ...(await orig<typeof import("@/lib/media/upload")>()),
  createImageUpload: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminToken, UnauthorizedError } from "@/lib/auth/session";
import {
  createPost,
  deletePost,
  PostExistsError,
  PostNotFoundError,
  updatePost,
  ValidationError,
} from "@/lib/posts/repo";
import { renderMarkdown } from "@/lib/markdown";
import { createImageUpload } from "@/lib/media/upload";
import {
  previewMarkdown,
  removePost,
  requestImageUpload,
  savePost,
} from "./actions";

const TOKEN = "id.token";

const input = {
  slug: "hello-world",
  title: "안녕",
  category: "dev",
  date: "2026-01-02",
  content: "본문",
  status: "published" as const,
};

describe("admin actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAdminToken).mockResolvedValue(TOKEN);
  });

  describe("without login", () => {
    beforeEach(() => {
      vi.mocked(requireAdminToken).mockRejectedValue(new UnauthorizedError());
    });

    it("rejects requestImageUpload and never presigns", async () => {
      await expect(
        requestImageUpload("hello-world", "image/png", 10)
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(createImageUpload).not.toHaveBeenCalled();
    });

    it("rejects savePost(create) and never touches the repo", async () => {
      await expect(savePost("create", input)).rejects.toBeInstanceOf(
        UnauthorizedError
      );
      expect(createPost).not.toHaveBeenCalled();
    });

    it("rejects savePost(update) and never touches the repo", async () => {
      await expect(savePost("update", input)).rejects.toBeInstanceOf(
        UnauthorizedError
      );
      expect(updatePost).not.toHaveBeenCalled();
    });

    it("rejects removePost", async () => {
      await expect(removePost("hello-world")).rejects.toBeInstanceOf(
        UnauthorizedError
      );
      expect(deletePost).not.toHaveBeenCalled();
    });

    it("rejects previewMarkdown", async () => {
      await expect(previewMarkdown("# x")).rejects.toBeInstanceOf(
        UnauthorizedError
      );
      expect(renderMarkdown).not.toHaveBeenCalled();
    });
  });

  it("creates a post and revalidates", async () => {
    expect(await savePost("create", input)).toEqual({
      ok: true,
      slug: "hello-world",
    });
    expect(createPost).toHaveBeenCalledWith(TOKEN, input);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/hello-world");
  });

  it("maps PostExistsError to a slug error", async () => {
    vi.mocked(createPost).mockRejectedValue(new PostExistsError("hello-world"));
    expect(await savePost("create", input)).toEqual({
      ok: false,
      errors: { slug: "이미 있는 주소입니다" },
    });
  });

  it("returns validation errors without calling the repo", async () => {
    const res = await savePost("create", { ...input, slug: "Bad Slug" });
    expect(res.ok).toBe(false);
    expect(createPost).not.toHaveBeenCalled();
    expect(updatePost).not.toHaveBeenCalled();
  });

  it("updates with the slug and without it in the payload", async () => {
    expect(await savePost("update", input)).toEqual({
      ok: true,
      slug: "hello-world",
    });
    const { slug, ...rest } = input;
    expect(updatePost).toHaveBeenCalledWith(TOKEN, slug, rest);
  });

  it("maps PostNotFoundError on update", async () => {
    vi.mocked(updatePost).mockRejectedValue(
      new PostNotFoundError("hello-world")
    );
    expect(await savePost("update", input)).toEqual({
      ok: false,
      errors: { slug: "글을 찾을 수 없습니다" },
    });
  });

  it("maps ValidationError from the API to field errors", async () => {
    vi.mocked(createPost).mockRejectedValue(
      new ValidationError({ title: "제목을 입력하세요" })
    );
    expect(await savePost("create", input)).toEqual({
      ok: false,
      errors: { title: "제목을 입력하세요" },
    });
    vi.mocked(updatePost).mockRejectedValue(
      new ValidationError({ date: "날짜" })
    );
    expect(await savePost("update", input)).toEqual({
      ok: false,
      errors: { date: "날짜" },
    });
  });

  it("propagates UnauthorizedError from the API (expired token)", async () => {
    vi.mocked(createPost).mockRejectedValue(new UnauthorizedError());
    await expect(savePost("create", input)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("propagates unknown errors", async () => {
    vi.mocked(createPost).mockRejectedValue(new Error("boom"));
    await expect(savePost("create", input)).rejects.toThrow("boom");
  });

  it("removePost deletes, revalidates and redirects", async () => {
    await removePost("hello-world");
    expect(deletePost).toHaveBeenCalledWith(TOKEN, "hello-world");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/posts/hello-world");
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("previewMarkdown renders for admins", async () => {
    vi.mocked(renderMarkdown).mockResolvedValue("<h1>x</h1>");
    expect(await previewMarkdown("# x")).toBe("<h1>x</h1>");
  });

  it("requestImageUpload delegates to createImageUpload after auth", async () => {
    vi.mocked(createImageUpload).mockResolvedValue({
      uploadUrl: "https://u",
      markdownPath: "/media/posts/a/x.png",
    });
    await expect(requestImageUpload("a", "image/png", 5)).resolves.toEqual({
      uploadUrl: "https://u",
      markdownPath: "/media/posts/a/x.png",
    });
    expect(createImageUpload).toHaveBeenCalledWith(TOKEN, {
      slug: "a",
      contentType: "image/png",
      size: 5,
    });
  });
});
