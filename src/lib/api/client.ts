import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { getDataConfig } from "@/lib/config";

export type ApiMethod = "GET" | "POST" | "PUT" | "DELETE";

export type ApiResponse<T> = { status: number; body: T | null };

/** Statuses the callers map to domain results; anything else throws. */
const MAPPED = new Set([400, 401, 403, 404, 409]);
const TIMEOUT_MS = 8000;

// Created on first use: the CI build has no env or credentials.
let credentials: ReturnType<typeof fromNodeProviderChain> | undefined;

/**
 * SigV4-signed (execute-api) call to the blog API. No retries. 2xx and the
 * mapped 4xx statuses return `{ status, body }` (204 → null body); any other
 * status, a timeout or a network error throws.
 */
export async function apiRequest<T>(
  method: ApiMethod,
  path: string,
  opts: { body?: unknown; userToken?: string } = {}
): Promise<ApiResponse<T>> {
  const { region, apiUrl } = getDataConfig();
  credentials ??= fromNodeProviderChain();

  const url = new URL(apiUrl + path);
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const headers: Record<string, string> = { host: url.host };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (opts.userToken) headers["x-user-token"] = opts.userToken;

  const signer = new SignatureV4({
    service: "execute-api",
    region,
    credentials,
    sha256: Sha256,
  });
  const signed = await signer.sign(
    new HttpRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers,
      body,
    })
  );

  const res = await fetch(url, {
    method,
    headers: signed.headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!res.ok && !MAPPED.has(res.status)) {
    throw new Error(`API ${res.status}`);
  }
  if (res.status === 204) return { status: 204, body: null };
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : null };
}
