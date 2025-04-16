#!/usr/bin/env -S node --experimental-strip-types

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { authenticate } from "../authentication.ts";
import { AppStateManager } from "../appState.ts";
import { DashboardApi } from "../DashboardApi.ts";
import {
  registerGetUserInfo,
  operationId as GetUserInfoOperationId,
} from "../tools/registerGetUserInfo.ts";
import {
  registerGetApplications,
  operationId as GetApplicationsOperationId,
} from "../tools/registerGetApplications.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerOpenApiTools } from "../tools/registerOpenApi.ts";
import { CONFIG } from "../config.ts";
import {
  ABTestingSpec,
  AnalyticsSpec,
  MonitoringSpec,
  RecommendSpec,
  SearchSpec,
  IngestionSpec,
} from "../openApi.ts";
import { type CliFilteringOptions, getToolFilter, isToolAllowed } from "../toolFilters.ts";

export type StartServerOptions = CliFilteringOptions;

export async function startServer(opts: StartServerOptions) {
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

    const toolFilter = getToolFilter(opts);

    // Dashboard API Tools
    if (isToolAllowed(GetUserInfoOperationId, toolFilter)) {
      registerGetUserInfo(server, dashboardApi);
    }

    if (isToolAllowed(GetApplicationsOperationId, toolFilter)) {
      registerGetApplications(server, dashboardApi);
    }

    // Search API Tools
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: SearchSpec,
      toolFilter,
    });

    // Analytics API Tools
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: AnalyticsSpec,
      toolFilter,
    });

    // Recommend API Tools
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: RecommendSpec,
      toolFilter,
    });

    // AB Testing
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: ABTestingSpec,
      toolFilter,
    });

    // Monitoring API Tools
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: MonitoringSpec,
      toolFilter,
    });

    // Ingestion API Tools
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: IngestionSpec,
      toolFilter,
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}
