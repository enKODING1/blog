import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api/client";
import { UnauthorizedError } from "@/lib/auth/session";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  createImageUpload,
} from "./upload";

const api = vi.mocked(apiRequest);
const p = { slug: "fixed", contentType: "image/png", size: 1234 };

describe("createImageUpload", () => {
  beforeEach(() => api.mockReset());

  it("POSTs /admin/uploads with the token and returns the URLs", async () => {
    const out = {
      uploadUrl: "https://bucket.s3.example/put",
      markdownPath: "/media/posts/fixed/x.png",
    };
    api.mockResolvedValue({ status: 200, body: out });
    await expect(createImageUpload("id.token", p)).resolves.toEqual(out);
    expect(api).toHaveBeenCalledWith("POST", "/admin/uploads", {
      body: p,
      userToken: "id.token",
    });
  });

  it("throws a plain Error on 400", async () => {
    api.mockResolvedValue({
      status: 400,
      body: { errors: { contentType: "x" } },
    });
    const err = await createImageUpload("t", p).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnauthorizedError);
  });

  it.each([401, 403])("maps %i to UnauthorizedError", async status => {
    api.mockResolvedValue({
      status,
      body: { error: status === 401 ? "unauthorized" : "forbidden" },
    });
    await expect(createImageUpload("t", p)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("treats a gateway 403 as a plain error", async () => {
    api.mockResolvedValue({ status: 403, body: { message: "Forbidden" } });
    const err = await createImageUpload("t", p).catch(e => e);
    expect(err).not.toBeInstanceOf(UnauthorizedError);
    expect(err.message).toBe("API 403 gateway");
  });

  it("throws on an unexpected status", async () => {
    api.mockResolvedValue({ status: 404, body: null });
    await expect(createImageUpload("t", p)).rejects.toThrow("API 404");
  });

  it("keeps the client-side pre-check constants", () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(Object.keys(ALLOWED_IMAGE_TYPES).sort()).toEqual([
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});
