const port = process.env.PORT ? parseInt(process.env.PORT) : 4242;

export const CONFIG = {
  // Authentication stuff
  port,
  clientId: "VERsdGeMujcaDaxphqeiRViwYvK2LtINlrD9EsZDWCs",
  redirectUri: `http://localhost:${port}/callback`,
  authEndpoint: "https://dashboard.algolia.com/oauth/authorize",
  tokenUrl: `https://dashboard.algolia.com/oauth/token`,
  // Dashboard API
  dashboardApiBaseUrl: "https://api.dashboard.algolia.com",
};
