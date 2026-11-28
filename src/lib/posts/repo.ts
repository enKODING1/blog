import { apiRequest, type ApiMethod } from "@/lib/api/client";
import { isLambdaNotFound, throwIfUnauthorized } from "@/lib/api/lambda-error";
import type { Post, PostInput, PostSummary } from "@/lib/posts/types";

export class PostExistsError extends Error {
  constructor(slug: string) {
    super(`Post already exists: ${slug}`);
    this.name = "PostExistsError";
  }
}

export class PostNotFoundError extends Error {
  constructor(slug: string) {
    super(`Post not found: ${slug}`);
    this.name = "PostNotFoundError";
  }
}

/** The API rejected the input (400). `errors` maps field → message. */
export class ValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super("Invalid post input");
    this.name = "ValidationError";
  }
}

const enc = encodeURIComponent;

/** Calls the API; Lambda 401/403 become UnauthorizedError (login banner/redirect). */
async function call<T>(
  method: ApiMethod,
  path: string,
  opts?: { body?: unknown; userToken?: string }
): Promise<{ status: number; body: T | null }> {
  const res = opts
    ? await apiRequest<T>(method, path, opts)
    : await apiRequest<T>(method, path);
  throwIfUnauthorized(res);
  return res;
}

function unexpected(status: number): Error {
  return new Error(`API ${status}`);
}

function errorsOf(body: unknown): Record<string, string> {
  const errors = (body as { errors?: unknown } | null)?.errors;
  if (errors && typeof errors === "object" && Object.keys(errors).length > 0) {
    return errors as Record<string, string>;
  }
  return { _: "저장하지 못했습니다. 입력값을 확인해 주세요." };
}

export async function listPublishedPosts(): Promise<PostSummary[]> {
  const res = await call<PostSummary[]>("GET", "/posts");
  if (res.status === 200 && res.body) return res.body;
  throw unexpected(res.status);
}

export async function getPublishedPost(slug: string): Promise<Post | null> {
  const res = await call<Post>("GET", `/posts/${enc(slug)}`);
  if (isLambdaNotFound(res)) return null;
  if (res.status === 200 && res.body) return res.body;
  throw unexpected(res.status);
}

export async function listAllPosts(token: string): Promise<PostSummary[]> {
  const res = await call<PostSummary[]>("GET", "/admin/posts", {
    userToken: token,
  });
  if (res.status === 200 && res.body) return res.body;
  throw unexpected(res.status);
}

export async function getPost(
  token: string,
  slug: string
): Promise<Post | null> {
  const res = await call<Post>("GET", `/admin/posts/${enc(slug)}`, {
    userToken: token,
  });
  if (isLambdaNotFound(res)) return null;
  if (res.status === 200 && res.body) return res.body;
  throw unexpected(res.status);
}

export async function createPost(
  token: string,
  input: PostInput
): Promise<Post> {
  const res = await call<Post>("POST", "/admin/posts", {
    body: input,
    userToken: token,
  });
  if (res.status === 201 && res.body) return res.body;
  if (res.status === 409) throw new PostExistsError(input.slug);
  if (res.status === 400) throw new ValidationError(errorsOf(res.body));
  throw unexpected(res.status);
}

export async function updatePost(
  token: string,
  slug: string,
  input: Omit<PostInput, "slug">
): Promise<Post> {
  const res = await call<Post>("PUT", `/admin/posts/${enc(slug)}`, {
    body: input,
    userToken: token,
  });
  if (res.status === 200 && res.body) return res.body;
  if (isLambdaNotFound(res)) throw new PostNotFoundError(slug);
  if (res.status === 400) throw new ValidationError(errorsOf(res.body));
  throw unexpected(res.status);
}

export async function deletePost(token: string, slug: string): Promise<void> {
  const res = await call<null>("DELETE", `/admin/posts/${enc(slug)}`, {
    userToken: token,
  });
  if (res.status !== 204) throw unexpected(res.status);
}
