import { UnauthorizedError } from "@/lib/auth/session";

type Res = { status: number; body: unknown };

function lambdaCode(body: unknown): string | undefined {
  const e = (body as { error?: unknown } | null)?.error;
  return typeof e === "string" ? e : undefined;
}

/**
 * Only the Lambda's own error bodies count as auth failures. API Gateway's own
 * 401/403 (`{"message":"Forbidden"}`, e.g. IAM/signing problems) is a
 * configuration bug and must not look like "log in again".
 */
export function throwIfUnauthorized(res: Res): void {
  if (res.status !== 401 && res.status !== 403) return;
  const code = lambdaCode(res.body);
  if (code === "unauthorized" || code === "forbidden") {
    throw new UnauthorizedError();
  }
  throw new Error(`API ${res.status} gateway`);
}

/**
 * True only for the Lambda's `{error:"not_found"}` 404. A gateway 404 (missing
 * route) throws instead of passing as "no such post".
 */
export function isLambdaNotFound(res: Res): boolean {
  if (res.status !== 404) return false;
  if (lambdaCode(res.body) === "not_found") return true;
  throw new Error("API 404 gateway");
}
