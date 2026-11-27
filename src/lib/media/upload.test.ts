import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));
vi.mock("@/lib/aws", () => ({ getS3: vi.fn(() => ({ fake: "s3" })) }));
vi.mock("@/lib/config", () => ({
  getDataConfig: () => ({
    region: "ap-northeast-2",
    postsTable: "t",
    mediaBucket: "test-bucket",
  }),
}));

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3 } from "@/lib/aws";
import { createImageUpload, MAX_IMAGE_BYTES } from "./upload";

describe("createImageUpload", () => {
  beforeEach(() => {
    vi.mocked(getSignedUrl).mockReset();
    vi.mocked(getSignedUrl).mockResolvedValue("https://signed.example/put");
    vi.mocked(getS3).mockClear();
  });

  it("presigns a PUT with the exact command input and 300s expiry", async () => {
    const res = await createImageUpload({
      slug: "fixed",
      contentType: "image/png",
      size: 1234,
    });
    expect(res.uploadUrl).toBe("https://signed.example/put");
    expect(res.markdownPath).toMatch(
      /^\/media\/posts\/fixed\/[0-9a-f-]{36}\.png$/
    );
    const [client, command, opts] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(client).toEqual({ fake: "s3" });
    expect(command).toBeInstanceOf(PutObjectCommand);
    const input = (command as PutObjectCommand).input;
    expect(input).toEqual({
      Bucket: "test-bucket",
      Key: res.markdownPath.replace("/media/", ""),
      ContentType: "image/png",
      ContentLength: 1234,
    });
    expect(opts).toEqual({ expiresIn: 300 });
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/gif", "gif"],
    ["image/webp", "webp"],
  ])("maps %s to .%s", async (contentType, ext) => {
    const res = await createImageUpload({ slug: "a", contentType, size: 1 });
    expect(res.markdownPath.endsWith("." + ext)).toBe(true);
  });

  it("rejects svg", async () => {
    await expect(
      createImageUpload({ slug: "a", contentType: "image/svg+xml", size: 1 })
    ).rejects.toThrow();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects over 10MB, accepts exactly 10MB", async () => {
    await expect(
      createImageUpload({
        slug: "a",
        contentType: "image/png",
        size: MAX_IMAGE_BYTES + 1,
      })
    ).rejects.toThrow();
    await expect(
      createImageUpload({
        slug: "a",
        contentType: "image/png",
        size: MAX_IMAGE_BYTES,
      })
    ).resolves.toBeDefined();
  });

  it.each([0, -1, 1.5, NaN])("rejects invalid size %s", async size => {
    await expect(
      createImageUpload({ slug: "a", contentType: "image/png", size })
    ).rejects.toThrow();
  });

  it.each(["../x", "A", "", "a/b", "a--b"])("rejects slug %j", async slug => {
    await expect(
      createImageUpload({ slug, contentType: "image/png", size: 1 })
    ).rejects.toThrow();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects prototype-ish content types", async () => {
    await expect(
      createImageUpload({ slug: "a", contentType: "constructor", size: 1 })
    ).rejects.toThrow();
  });
});
