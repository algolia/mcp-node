import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { authenticate } from "./authentication.ts";
import { AppStateManager } from "./appState.ts";
import { DashboardApi } from "./DashboardApi.ts";
import { registerGetUserInfo } from "./tools/registerGetUserInfo.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGetApplications } from "./tools/registerGetApplications.ts";
import {
  loadOpenApiSpec,
  registerOpenApiTools,
} from "./tools/registerOpenApi.ts";
import { CONFIG } from "./config.ts";

try {
  const appState = await AppStateManager.load();

  if (!appState.get("accessToken")) {
    const token = await authenticate();

    await appState.update({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    });
  }

  const dashboardApi = new DashboardApi({
    baseUrl: CONFIG.dashboardApiBaseUrl,
    appState,
  });

  const server = new McpServer({
    name: "algolia",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  // Dashboard API Tools
  registerGetUserInfo(server, dashboardApi);
  registerGetApplications(server, dashboardApi);

  // Search API Tools
  const searchOpenApiSpec = await loadOpenApiSpec(
    new URL("../data/search.yml", import.meta.url).pathname
  );

  registerOpenApiTools({
    server,
    dashboardApi,
    openApiSpec: searchOpenApiSpec,
    allowedOperationIds: new Set(["listIndices", "getSettings"]),
  });

  const analyticsOpenApiSpec = await loadOpenApiSpec(
      new URL("../data/analytics.yml", import.meta.url).pathname
  );

  registerOpenApiTools({
    server,
    dashboardApi,
    openApiSpec: analyticsOpenApiSpec,
    allowedOperationIds: new Set(["getTopSearches", "getTopHits", "getNoResultsRate"]),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (err) {
  console.error("Error starting server:", err);
  process.exit(1);
}
