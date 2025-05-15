import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { type Context, Hono } from "hono";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from "./utils.ts";
import {
  clientIdAlreadyApproved,
  parseRedirectApproval,
  renderApprovalDialog,
} from "./workers-oauth-utils.ts";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/oauth/authorize", async (c) => {
  console.log("--> GET /oauth/authorize");

  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text("Invalid request", 400);
  }

  if (await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
    return redirectToAlgolia(c, oauthReqInfo, { ...Object.fromEntries(c.req.raw.headers.entries()) });
  }

  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    server: {
      name: "Algolia MCP Server on Cloudflare (DEMO)",
      logo: "https://storage.googleapis.com/byoc-images-assets/algolia.svg",
      description: "This is a demo Algolia MCP Remote Server using Cloudflare for hosting.", // optional
    },
    state: { oauthReqInfo }, // arbitrary data that flows through the form submission below
  });
});

app.post("/oauth/authorize", async (c) => {
  console.log('--> POST /oauth/authorize');

  // Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
  const { state, headers } = await parseRedirectApproval(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
  if (!state.oauthReqInfo) {
    return c.text("Invalid request", 400);
  }

  return redirectToAlgolia(c, state.oauthReqInfo, headers);
});

async function redirectToAlgolia(c: Context, oauthReqInfo: AuthRequest, headers: Record<string, string> = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location: getUpstreamAuthorizeUrl({
        upstream_url: c.env.AUTH_URL,
        scope: 'public applications:manage keys:manage',
        client_id: c.env.CLIENT_ID,
        redirect_uri: new URL('/oauth/callback', c.req.url).href,
        state: btoa(JSON.stringify(oauthReqInfo)),
      }),
    },
  })
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from GitHub after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/oauth/callback", async (c) => {
  console.log('--> GET /oauth/callback');

  // Get the oathReqInfo out of KV
  const oauthReqInfo = JSON.parse(atob(c.req.query("state") as string)) as AuthRequest;
  if (!oauthReqInfo.clientId) {
    return c.text("Invalid state", 400);
  }

  const [token, errResponse] = await fetchUpstreamAuthToken({
    upstream_url: c.env.TOKEN_URL,
    client_id: c.env.CLIENT_ID,
    client_secret: c.env.CLIENT_SECRET,
    code: c.req.query("code"),
    redirect_uri: new URL("/oauth/callback", c.req.url).href,
  });
  if (errResponse != null) {
    return errResponse;
  }

  console.log('Token received:', token);

  if (!token.user.email.endsWith("@algolia.com")) {
    return c.text("User not allowed", 403);
  }

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
