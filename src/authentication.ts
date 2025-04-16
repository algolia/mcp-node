import http from "node:http";
import crypto from "node:crypto";
import open from "open";
import { CONFIG } from "./config.ts";

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}
function generateCodeChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function getAccessToken(
  authorizationCode: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    code: authorizationCode,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetch(CONFIG.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const token = await response.json();
  return token as TokenResponse;
}

export async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${response.statusText}`);
  }

  const token = await response.json();
  return token as TokenResponse;
}

export async function authenticate() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const authorizationUrl = new URL(CONFIG.authEndpoint);
  authorizationUrl.searchParams.set("scope", `public keys:manage applications:manage`);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", CONFIG.clientId);
  authorizationUrl.searchParams.set("redirect_uri", CONFIG.redirectUri);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  let server: http.Server | null = null;

  try {
    const authCodeResolvers = Promise.withResolvers<string>();
    server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad Request");
        return;
      }

      const url = new URL(req.url, `http://localhost`);

      switch (url.pathname) {
        case "/callback": {
          // Handle the callback with the authorization code
          const authorizationCode = url.searchParams.get("code");

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><script>open(location, '_self').close();</script></body></html>");

          if (!authorizationCode) {
            authCodeResolvers.reject(new Error("Authorization code not found"));
          } else {
            authCodeResolvers.resolve(authorizationCode);
          }
          break;
        }
        default: {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      }
    });

    server.listen(CONFIG.port);

    await open(authorizationUrl.toString());

    const authorizationCode = await authCodeResolvers.promise;

    return await getAccessToken(authorizationCode, codeVerifier);
  } finally {
    server?.close();
  }
}
