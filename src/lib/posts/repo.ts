import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDdb } from "@/lib/aws";
import { getDataConfig } from "@/lib/config";
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

const pkOf = (slug: string) => `POST#${slug}`;

function isConditionFailure(err: unknown): boolean {
  return (
    err instanceof ConditionalCheckFailedException ||
    (err as { name?: string } | null)?.name ===
      "ConditionalCheckFailedException"
  );
}

function toPost(item: Record<string, unknown>): Post {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pk, gsi1pk, gsi1sk, ...rest } = item;
  return rest as Post;
}

function toSummary(item: Record<string, unknown>): PostSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { content, ...rest } = toPost(item);
  return rest;
}

function itemOf(post: Post): Record<string, unknown> {
  return {
    pk: pkOf(post.slug),
    ...(post.status === "published"
      ? { gsi1pk: "PUBLISHED", gsi1sk: `${post.date}#${post.slug}` }
      : {}),
    slug: post.slug,
    title: post.title,
    category: post.category,
    date: post.date,
    content: post.content,
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export async function listPublishedPosts(): Promise<PostSummary[]> {
  const { postsTable } = getDataConfig();
  const out: PostSummary[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const res = await getDdb().send(
      new QueryCommand({
        TableName: postsTable,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :p",
        ExpressionAttributeValues: { ":p": "PUBLISHED" },
        ScanIndexForward: false,
        ExclusiveStartKey: key,
      })
    );
    for (const item of res.Items ?? []) out.push(toSummary(item));
    key = res.LastEvaluatedKey;
  } while (key);
  return out;
}

export async function listAllPosts(): Promise<PostSummary[]> {
  const { postsTable } = getDataConfig();
  const out: PostSummary[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const res = await getDdb().send(
      new ScanCommand({
        TableName: postsTable,
        ProjectionExpression:
          "#slug, #title, #category, #date, #status, #c, #u",
        ExpressionAttributeNames: {
          "#slug": "slug",
          "#title": "title",
          "#category": "category",
          "#date": "date",
          "#status": "status",
          "#c": "createdAt",
          "#u": "updatedAt",
        },
        ExclusiveStartKey: key,
      })
    );
    for (const item of res.Items ?? []) out.push(toSummary(item));
    key = res.LastEvaluatedKey;
  } while (key);
  return out.sort(
    (a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug)
  );
}

export async function getPost(slug: string): Promise<Post | null> {
  const res = await getDdb().send(
    new GetCommand({
      TableName: getDataConfig().postsTable,
      Key: { pk: pkOf(slug) },
    })
  );
  return res.Item ? toPost(res.Item) : null;
}

export async function getPublishedPost(slug: string): Promise<Post | null> {
  const post = await getPost(slug);
  return post && post.status === "published" ? post : null;
}

export async function createPost(
  input: PostInput,
  now: Date = new Date()
): Promise<Post> {
  const ts = now.toISOString();
  const post: Post = { ...input, createdAt: ts, updatedAt: ts };
  try {
    await getDdb().send(
      new PutCommand({
        TableName: getDataConfig().postsTable,
        Item: itemOf(post),
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
  } catch (err) {
    if (isConditionFailure(err)) throw new PostExistsError(input.slug);
    throw err;
  }
  return post;
}

export async function updatePost(
  slug: string,
  input: Omit<PostInput, "slug">,
  now: Date = new Date()
): Promise<Post> {
  const published = input.status === "published";
  const sets = [
    "#title = :title",
    "#category = :category",
    "#date = :date",
    "#content = :content",
    "#status = :status",
    "#updatedAt = :updatedAt",
  ];
  const values: Record<string, unknown> = {
    ":title": input.title,
    ":category": input.category,
    ":date": input.date,
    ":content": input.content,
    ":status": input.status,
    ":updatedAt": now.toISOString(),
  };
  if (published) {
    sets.push("gsi1pk = :gsi1pk", "gsi1sk = :gsi1sk");
    values[":gsi1pk"] = "PUBLISHED";
    values[":gsi1sk"] = `${input.date}#${slug}`;
  }
  const expression =
    `SET ${sets.join(", ")}` + (published ? "" : " REMOVE gsi1pk, gsi1sk");
  try {
    const res = await getDdb().send(
      new UpdateCommand({
        TableName: getDataConfig().postsTable,
        Key: { pk: pkOf(slug) },
        UpdateExpression: expression,
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: {
          "#title": "title",
          "#category": "category",
          "#date": "date",
          "#content": "content",
          "#status": "status",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      })
    );
    return toPost(res.Attributes ?? {});
  } catch (err) {
    if (isConditionFailure(err)) throw new PostNotFoundError(slug);
    throw err;
  }
}

export async function deletePost(slug: string): Promise<void> {
  await getDdb().send(
    new DeleteCommand({
      TableName: getDataConfig().postsTable,
      Key: { pk: pkOf(slug) },
    })
  );
}

/** Unconditional overwrite. For the one-off migration script only. */
export async function putPost(post: Post): Promise<void> {
  await getDdb().send(
    new PutCommand({
      TableName: getDataConfig().postsTable,
      Item: itemOf(post),
    })
  );
}
