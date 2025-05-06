import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { type Props } from "./utils.ts";
import { env } from "cloudflare:workers";
import {
  clientIdAlreadyApproved,
  parseRedirectApproval,
  renderApprovalDialog,
} from "./workers-oauth-utils.ts";
import { CONFIG } from "../config.js";
import crypto from "node:crypto";
import type { TokenResponse } from "../authentication.ts";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
  console.log("Authorize access token");

  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text("Invalid request", 400);
  }

  if (await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, env.COOKIE_ENCRYPTION_KEY)) {
    return redirectToAlgolia(c.req.raw, oauthReqInfo);
  }

  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    server: {
      name: "Algolia MCP Server on Cloudflare",
      logo: "https://avatars.githubusercontent.com/u/314135?s=200&v=4",
      description: "This is a demo Algolia MCP Remote Server using Cloudflare for hosting.", // optional
    },
    state: { oauthReqInfo }, // arbitrary data that flows through the form submission below
  });
});

app.post("/authorize", async (c) => {
  console.log('Received POST /authorize');

  // Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
  const { state, headers } = await parseRedirectApproval(c.req.raw, env.COOKIE_ENCRYPTION_KEY);
  if (!state.oauthReqInfo) {
    return c.text("Invalid request", 400);
  }

  return redirectToAlgolia(c.req.raw, state.oauthReqInfo, headers);
});

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function redirectToAlgolia(
  request: Request,
  oauthReqInfo: AuthRequest,
  headers: Record<string, string> = {},
) {
  console.log('Redirecting to Algolia:', oauthReqInfo);

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const authorizationUrl = new URL(CONFIG.authEndpoint);
  authorizationUrl.searchParams.set("scope", `public keys:manage applications:manage`);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", CONFIG.clientId);
  authorizationUrl.searchParams.set("redirect_uri", "http://localhost:4242/callback");
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("state", btoa(JSON.stringify(oauthReqInfo)));
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location: authorizationUrl.href,
    },
  });
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from GitHub after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
  console.log('Callback received:', c.req.query("state"), c.req.query("code"));

  // Get the oathReqInfo out of KV
  const oauthReqInfo = JSON.parse(atob(c.req.query("state") as string)) as AuthRequest;
  if (!oauthReqInfo.clientId) {
    return c.text("Invalid state", 400);
  }

  const authenticationCode = c.req.query("code");
  if (!authenticationCode) {
    return c.text("Missing code", 400);
  }

  // Exchange the code for an access token
  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    code: authenticationCode,
    grant_type: "authorization_code",
    code_verifier: "",
  });

  const response = await fetch(CONFIG.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const token: TokenResponse = await response.json();

  console.log('Token received:', token);

  // Return back to the MCP client a new token
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: token.user.id,
    metadata: {
      label: token.user.name,
    },
    scope: oauthReqInfo.scope,
    // This will be available on this.props inside AlgoliaMCP
    props: {
      id: token.user.id,
      name: token.user.name,
      email: token.user.email,
      avatar: token.user.avatar_url,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      apiKeys: {}
    } satisfies Props,
  });

  console.log('Redirecting to:', redirectTo);

  return Response.redirect(redirectTo);
});

export { app as AlgoliaOAuthHandler };
