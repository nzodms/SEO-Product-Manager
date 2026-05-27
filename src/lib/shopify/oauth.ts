import crypto from "node:crypto";

// Shopify OAuth (Authorization Code grant) for apps that expose a Client ID +
// Client Secret (Dev/Partner Dashboard). The resulting OFFLINE access token does
// not expire and has no refresh token — re-auth is only needed if it's revoked
// (app uninstalled) which surfaces as a 401 on Admin API calls.

export const DEFAULT_SCOPES = [
  "read_products",
  "write_products",
  "read_collections",
  "write_collections",
];

export function normalizeShopDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return d;
}

export function isValidShopDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain);
}

export function buildAuthorizeUrl(params: {
  shop: string;
  clientId: string;
  scopes: string;
  redirectUri: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    scope: params.scopes,
    redirect_uri: params.redirectUri,
    state: params.state,
    // Offline access (default): a long-lived token for background API calls.
    "grant_options[]": "",
  });
  // Drop the empty grant_options to request the default offline token cleanly.
  q.delete("grant_options[]");
  return `https://${params.shop}/admin/oauth/authorize?${q.toString()}`;
}

// Verifies the HMAC signature Shopify appends to the OAuth callback query.
export function verifyOauthHmac(searchParams: URLSearchParams, clientSecret: string): boolean {
  const provided = searchParams.get("hmac");
  if (!provided) return false;
  const pairs: string[] = [];
  for (const [k, v] of searchParams.entries()) {
    if (k === "hmac" || k === "signature") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const message = pairs.join("&");
  const digest = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

export interface TokenExchangeResult {
  accessToken: string;
  scope: string;
}

export async function exchangeCodeForToken(params: {
  shop: string;
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<TokenExchangeResult> {
  const res = await fetch(`https://${params.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
    }),
  });
  if (!res.ok) {
    throw new Error(`Échange OAuth échoué (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string; scope?: string };
  if (!json.access_token) throw new Error("Réponse OAuth sans access_token.");
  return { accessToken: json.access_token, scope: json.scope ?? "" };
}

export function randomState(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Derives the app's public origin (for the OAuth redirect URI) from the request,
// allowing an APP_URL override for non-localhost deployments.
export function appOriginFromRequest(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  const host = forwardedHost ?? url.host;
  return `${proto}://${host}`;
}
