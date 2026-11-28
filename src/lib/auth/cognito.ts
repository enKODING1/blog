import { getConfig } from "@/lib/config";

function redirectUri(): string {
  return `${getConfig().siteUrl}/api/auth/callback`;
}

/** Cognito Managed Login authorize URL (code flow + PKCE S256). */
export function buildAuthorizeUrl(p: {
  state: string;
  challenge: string;
}): string {
  const { cognito } = getConfig();
  const q = new URLSearchParams({
    response_type: "code",
    client_id: cognito.clientId,
    redirect_uri: redirectUri(),
    scope: "openid email",
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  });
  return `${cognito.domain}/oauth2/authorize?${q}`;
}

/** Cognito hosted logout URL; returns the browser to the site root. */
export function buildLogoutUrl(): string {
  const { cognito, siteUrl } = getConfig();
  const q = new URLSearchParams({
    client_id: cognito.clientId,
    logout_uri: `${siteUrl}/`,
  });
  return `${cognito.domain}/logout?${q}`;
}

/** Exchanges an authorization code (public client, PKCE). Throws on failure. */
export async function exchangeCode(
  code: string,
  verifier: string
): Promise<{ idToken: string }> {
  const { cognito } = getConfig();
  const res = await fetch(`${cognito.domain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cognito.clientId,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status}`);
  const json = (await res.json()) as { id_token?: unknown };
  if (typeof json.id_token !== "string" || !json.id_token) {
    throw new Error("Token exchange failed: no id_token");
  }
  return { idToken: json.id_token };
}
