import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import { UnauthorizedError } from "@/lib/auth/session";
import {
  PostExistsError,
  PostNotFoundError,
  ValidationError,
  createPost,
  deletePost,
  getPost,
  getPublishedPost,
  listAllPosts,
  listPublishedPosts,
  updatePost,
} from "@/lib/posts/repo";
import type { Post, PostInput } from "@/lib/posts/types";

const api = vi.mocked(apiRequest);
const TOKEN = "id.token";

const input: PostInput = {
  slug: "browser-rendering",
  title: "t",
  category: "c",
  date: "2025-12-01",
  content: "body",
  status: "published",
};
const post: Post = {
  ...input,
  createdAt: "2026-01-02T03:04:05.000Z",
  updatedAt: "2026-01-02T03:04:05.000Z",
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { content, ...summary } = post;

const ok = (status: number, body: unknown) => ({ status, body });

beforeEach(() => {
  api.mockReset();
});

describe("public reads", () => {
  it("listPublishedPosts calls GET /posts without a user token", async () => {
    api.mockResolvedValue(ok(200, [summary]));
    await expect(listPublishedPosts()).resolves.toEqual([summary]);
    expect(api).toHaveBeenCalledWith("GET", "/posts");
  });

  it("getPublishedPost returns the post", async () => {
    api.mockResolvedValue(ok(200, post));
    await expect(getPublishedPost("browser-rendering")).resolves.toEqual(post);
    expect(api).toHaveBeenCalledWith("GET", "/posts/browser-rendering");
  });

  it("getPublishedPost maps 404 to null", async () => {
    api.mockResolvedValue(ok(404, { error: "not_found" }));
    await expect(getPublishedPost("nope")).resolves.toBeNull();
  });

  it("propagates client errors (5xx/network)", async () => {
    api.mockRejectedValue(new Error("API 500"));
    await expect(listPublishedPosts()).rejects.toThrow("API 500");
  });

  it("throws on an unexpected status", async () => {
    api.mockResolvedValue(ok(400, { errors: {} }));
    await expect(listPublishedPosts()).rejects.toThrow("API 400");
  });
});

describe("admin reads", () => {
  it("listAllPosts sends the user token", async () => {
    api.mockResolvedValue(ok(200, [summary]));
    await expect(listAllPosts(TOKEN)).resolves.toEqual([summary]);
    expect(api).toHaveBeenCalledWith("GET", "/admin/posts", {
      userToken: TOKEN,
    });
  });

  it("getPost returns the post and maps 404 to null", async () => {
    api.mockResolvedValueOnce(ok(200, { ...post, status: "draft" }));
    expect((await getPost(TOKEN, "a"))?.status).toBe("draft");
    expect(api).toHaveBeenCalledWith("GET", "/admin/posts/a", {
      userToken: TOKEN,
    });
    api.mockResolvedValueOnce(ok(404, { error: "not_found" }));
    await expect(getPost(TOKEN, "a")).resolves.toBeNull();
  });

  it.each([401, 403])("maps %i to UnauthorizedError", async status => {
    api.mockResolvedValue(ok(status, { error: "x" }));
    await expect(listAllPosts(TOKEN)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(getPost(TOKEN, "a")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("encodes the slug in the path", async () => {
    api.mockResolvedValue(ok(404, null));
    await getPost(TOKEN, "a/b");
    expect(api).toHaveBeenCalledWith("GET", "/admin/posts/a%2Fb", {
      userToken: TOKEN,
    });
  });
});

describe("createPost", () => {
  it("POSTs the input and returns the created post", async () => {
    api.mockResolvedValue(ok(201, post));
    await expect(createPost(TOKEN, input)).resolves.toEqual(post);
    expect(api).toHaveBeenCalledWith("POST", "/admin/posts", {
      body: input,
      userToken: TOKEN,
    });
  });

  it("maps 409 to PostExistsError", async () => {
    api.mockResolvedValue(
      ok(409, { errors: { slug: "이미 있는 주소입니다" } })
    );
    await expect(createPost(TOKEN, input)).rejects.toBeInstanceOf(
      PostExistsError
    );
  });

  it("maps 400 to ValidationError with the errors", async () => {
    api.mockResolvedValue(ok(400, { errors: { title: "제목을 입력하세요" } }));
    const err = await createPost(TOKEN, input).catch(e => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).errors).toEqual({
      title: "제목을 입력하세요",
    });
  });

  it.each([401, 403])("maps %i to UnauthorizedError", async status => {
    api.mockResolvedValue(ok(status, { error: "x" }));
    await expect(createPost(TOKEN, input)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });
});

describe("updatePost", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug, ...rest } = input;

  it("PUTs to the path slug and returns the post", async () => {
    api.mockResolvedValue(ok(200, post));
    await expect(updatePost(TOKEN, slug, rest)).resolves.toEqual(post);
    expect(api).toHaveBeenCalledWith("PUT", "/admin/posts/browser-rendering", {
      body: rest,
      userToken: TOKEN,
    });
  });

  it("maps 404 to PostNotFoundError", async () => {
    api.mockResolvedValue(ok(404, { error: "not_found" }));
    await expect(updatePost(TOKEN, "nope", rest)).rejects.toBeInstanceOf(
      PostNotFoundError
    );
  });

  it("maps 400 to ValidationError", async () => {
    api.mockResolvedValue(ok(400, { errors: { date: "날짜" } }));
    const err = await updatePost(TOKEN, slug, rest).catch(e => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).errors).toEqual({ date: "날짜" });
  });

  it.each([401, 403])("maps %i to UnauthorizedError", async status => {
    api.mockResolvedValue(ok(status, { error: "x" }));
    await expect(updatePost(TOKEN, slug, rest)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });
});

describe("deletePost", () => {
  it("DELETEs with the token and resolves on 204", async () => {
    api.mockResolvedValue(ok(204, null));
    await expect(deletePost(TOKEN, "a")).resolves.toBeUndefined();
    expect(api).toHaveBeenCalledWith("DELETE", "/admin/posts/a", {
      userToken: TOKEN,
    });
  });

  it("treats 400 as an error, not success", async () => {
    api.mockResolvedValue(ok(400, { errors: { slug: "x" } }));
    await expect(deletePost(TOKEN, "a")).rejects.toThrow();
  });

  it.each([401, 403])("maps %i to UnauthorizedError", async status => {
    api.mockResolvedValue(ok(status, { error: "x" }));
    await expect(deletePost(TOKEN, "a")).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });
});
