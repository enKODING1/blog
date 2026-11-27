import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { resetConfigForTests } from "@/lib/config";
import {
  PostExistsError,
  PostNotFoundError,
  createPost,
  deletePost,
  getPost,
  getPublishedPost,
  listAllPosts,
  listPublishedPosts,
  putPost,
  updatePost,
} from "@/lib/posts/repo";
import type { PostInput } from "@/lib/posts/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
const TABLE = "blog-prod-post-content-table";
const now = new Date("2026-01-02T03:04:05.000Z");

const input: PostInput = {
  slug: "browser-rendering",
  title: "t",
  category: "c",
  date: "2025-12-01",
  content: "body",
  status: "published",
};

const ccf = () =>
  new ConditionalCheckFailedException({ message: "x", $metadata: {} });

beforeEach(() => {
  process.env.BLOG_AWS_REGION = "ap-northeast-2";
  process.env.BLOG_POSTS_TABLE = TABLE;
  process.env.BLOG_MEDIA_BUCKET = "bucket";
  resetConfigForTests();
  ddbMock.reset();
});

afterEach(() => {
  delete process.env.BLOG_AWS_REGION;
  delete process.env.BLOG_POSTS_TABLE;
  delete process.env.BLOG_MEDIA_BUCKET;
  resetConfigForTests();
});

describe("createPost", () => {
  it("writes a published item with GSI keys and equal timestamps", async () => {
    ddbMock.on(PutCommand).resolves({});
    const post = await createPost(input, now);
    const call = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(call.TableName).toBe(TABLE);
    expect(call.ConditionExpression).toBe("attribute_not_exists(pk)");
    expect(call.Item).toMatchObject({
      pk: "POST#browser-rendering",
      gsi1pk: "PUBLISHED",
      gsi1sk: "2025-12-01#browser-rendering",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(post).toEqual({
      ...input,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(post).not.toHaveProperty("pk");
  });

  it("omits GSI keys for drafts", async () => {
    ddbMock.on(PutCommand).resolves({});
    await createPost({ ...input, status: "draft" }, now);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(item).not.toHaveProperty("gsi1pk");
    expect(item).not.toHaveProperty("gsi1sk");
  });

  it("maps ConditionalCheckFailedException to PostExistsError", async () => {
    ddbMock.on(PutCommand).rejects(ccf());
    await expect(createPost(input, now)).rejects.toBeInstanceOf(
      PostExistsError
    );
  });

  it("propagates other errors unchanged", async () => {
    const err = new Error("boom");
    ddbMock.on(PutCommand).rejects(err);
    await expect(createPost(input, now)).rejects.toBe(err);
  });
});

describe("updatePost", () => {
  const { slug, ...rest } = input;
  const attrs = {
    pk: "POST#browser-rendering",
    slug,
    ...rest,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: now.toISOString(),
  };

  it("sets GSI keys when published and requires existence", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        ...attrs,
        gsi1pk: "PUBLISHED",
        gsi1sk: "2025-12-01#browser-rendering",
      },
    });
    const post = await updatePost(slug, rest, now);
    const i = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(i.Key).toEqual({ pk: "POST#browser-rendering" });
    expect(i.ConditionExpression).toBe("attribute_exists(pk)");
    expect(i.UpdateExpression).toContain("gsi1pk");
    expect(i.UpdateExpression).not.toContain("REMOVE");
    expect(i.UpdateExpression).not.toContain("createdAt");
    expect(post.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(post).not.toHaveProperty("pk");
    expect(post).not.toHaveProperty("gsi1pk");
    expect(post).not.toHaveProperty("gsi1sk");
  });

  it("removes GSI keys when changed to draft", async () => {
    ddbMock
      .on(UpdateCommand)
      .resolves({ Attributes: { ...attrs, status: "draft" } });
    await updatePost(slug, { ...rest, status: "draft" }, now);
    const i = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(i.UpdateExpression).toContain("REMOVE gsi1pk, gsi1sk");
  });

  it("throws PostNotFoundError for a missing slug", async () => {
    ddbMock.on(UpdateCommand).rejects(ccf());
    await expect(updatePost("nope", rest, now)).rejects.toBeInstanceOf(
      PostNotFoundError
    );
  });

  it("propagates other errors unchanged", async () => {
    const err = new Error("boom");
    ddbMock.on(UpdateCommand).rejects(err);
    await expect(updatePost(slug, rest, now)).rejects.toBe(err);
  });
});

describe("getPost / getPublishedPost", () => {
  const item = (status: string) => ({
    pk: "POST#a",
    gsi1pk: "PUBLISHED",
    gsi1sk: "2025-12-01#a",
    slug: "a",
    title: "t",
    category: "c",
    date: "2025-12-01",
    content: "b",
    status,
    createdAt: "x",
    updatedAt: "y",
  });

  it("returns null when missing", async () => {
    ddbMock.on(GetCommand).resolves({});
    expect(await getPost("a")).toBeNull();
    expect(await getPublishedPost("a")).toBeNull();
  });

  it("strips internal keys", async () => {
    ddbMock.on(GetCommand).resolves({ Item: item("published") });
    const p = await getPost("a");
    expect(p).not.toHaveProperty("pk");
    expect(p).not.toHaveProperty("gsi1pk");
    expect(p).not.toHaveProperty("gsi1sk");
    expect(p?.content).toBe("b");
    expect(ddbMock.commandCalls(GetCommand)[0].args[0].input.Key).toEqual({
      pk: "POST#a",
    });
  });

  it("getPublishedPost returns null for drafts", async () => {
    ddbMock.on(GetCommand).resolves({ Item: item("draft") });
    expect(await getPublishedPost("a")).toBeNull();
    expect((await getPost("a"))?.status).toBe("draft");
  });

  it("getPublishedPost returns published posts", async () => {
    ddbMock.on(GetCommand).resolves({ Item: item("published") });
    expect((await getPublishedPost("a"))?.slug).toBe("a");
  });
});

describe("listings", () => {
  const sum = (slug: string, date: string, status = "published") => ({
    pk: `POST#${slug}`,
    gsi1pk: "PUBLISHED",
    gsi1sk: `${date}#${slug}`,
    slug,
    title: slug,
    category: "c",
    date,
    status,
    createdAt: "x",
    updatedAt: "y",
  });

  it("listPublishedPosts merges pages, queries gsi1 descending", async () => {
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [sum("b", "2025-12-02")],
        LastEvaluatedKey: { pk: "k" },
      })
      .resolvesOnce({ Items: [sum("a", "2025-12-01")] });
    const posts = await listPublishedPosts();
    expect(posts.map(p => p.slug)).toEqual(["b", "a"]);
    for (const p of posts) {
      expect(p).not.toHaveProperty("pk");
      expect(p).not.toHaveProperty("gsi1pk");
      expect(p).not.toHaveProperty("gsi1sk");
    }
    const calls = ddbMock.commandCalls(QueryCommand);
    expect(calls).toHaveLength(2);
    const first = calls[0].args[0].input;
    expect(first.TableName).toBe(TABLE);
    expect(first.IndexName).toBe("gsi1");
    expect(first.ScanIndexForward).toBe(false);
    expect(Object.values(first.ExpressionAttributeValues ?? {})).toContain(
      "PUBLISHED"
    );
    expect(calls[1].args[0].input.ExclusiveStartKey).toEqual({ pk: "k" });
  });

  it("listAllPosts scans without content, sorts by date desc", async () => {
    ddbMock
      .on(ScanCommand)
      .resolvesOnce({
        Items: [sum("a", "2025-01-01", "draft")],
        LastEvaluatedKey: { pk: "k" },
      })
      .resolvesOnce({
        Items: [sum("c", "2025-03-01"), sum("b", "2025-02-01")],
      });
    const posts = await listAllPosts();
    expect(posts.map(p => p.slug)).toEqual(["c", "b", "a"]);
    expect(posts[0]).not.toHaveProperty("pk");
    const input = ddbMock.commandCalls(ScanCommand)[0].args[0].input;
    expect(input.ProjectionExpression).toBeDefined();
    const names = Object.values(input.ExpressionAttributeNames ?? {});
    expect(names).not.toContain("content");
    expect(names).toContain("slug");
  });
});

describe("deletePost / putPost", () => {
  it("deletes by key", async () => {
    ddbMock.on(DeleteCommand).resolves({});
    await deletePost("a");
    expect(ddbMock.commandCalls(DeleteCommand)[0].args[0].input).toMatchObject({
      TableName: TABLE,
      Key: { pk: "POST#a" },
    });
  });

  it("putPost overwrites unconditionally and derives keys", async () => {
    ddbMock.on(PutCommand).resolves({});
    await putPost({ ...input, createdAt: "c", updatedAt: "u" });
    const i = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(i.ConditionExpression).toBeUndefined();
    expect(i.Item).toMatchObject({
      pk: "POST#browser-rendering",
      gsi1pk: "PUBLISHED",
      createdAt: "c",
      updatedAt: "u",
    });
  });
});
