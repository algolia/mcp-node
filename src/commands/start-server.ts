#!/usr/bin/env -S node --experimental-strip-types

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { authenticate } from "../authentication.ts";
import { AppStateManager } from "../appState.ts";
import { DashboardApi } from "../DashboardApi.ts";
import {
  operationId as GetUserInfoOperationId,
  registerGetUserInfo,
} from "../tools/registerGetUserInfo.ts";
import {
  operationId as GetApplicationsOperationId,
  registerGetApplications,
} from "../tools/registerGetApplications.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerOpenApiTools } from "../tools/registerOpenApi.ts";
import { CONFIG } from "../config.ts";
import {
  ABTestingSpec,
  AnalyticsSpec,
  CollectionsSpec,
  IngestionSpec,
  MonitoringSpec,
  QuerySuggestionsSpec,
  RecommendSpec,
  SearchSpec,
  UsageSpec,
} from "../openApi.ts";
import { type CliFilteringOptions, getToolFilter, isToolAllowed } from "../toolFilters.ts";
import {
  operationId as SetAttributesForFacetingOperationId,
  registerSetAttributesForFaceting,
} from "../tools/registerSetAttributesForFaceting.ts";
import {
  registerSetCustomRanking,
  operationId as SetCustomRankingOperationId
} from "../tools/registerSetCustomRanking.ts";

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

    // Usage
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: UsageSpec,
      toolFilter,
      requestMiddlewares: [
        // The Usage API expects `name` parameter as multiple values
        // rather than comma-separated.
        async ({ request }) => {
          const url = new URL(request.url);
          const nameParams = url.searchParams.get("name");

          if (!nameParams) {
            return new Request(url, request.clone());
          }

          const nameValues = nameParams.split(",");

          url.searchParams.delete("name");

          nameValues.forEach((value) => {
            url.searchParams.append("name", value);
          });

          return new Request(url, request.clone());
        },
      ],
    });

    // Ingestion API Tools
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: IngestionSpec,
      toolFilter,
      requestMiddlewares: [
        // Dirty fix for Claud hallucinating regions
        async ({ request, params }) => {
          const application = await dashboardApi.getApplication(params.applicationId);
          const region = application.data.attributes.log_region === "de" ? "eu" : "us";

          const url = new URL(request.url);
          const regionFromUrl = url.hostname.match(/data\.(.+)\.algolia.com/)?.[0];

          if (regionFromUrl !== region) {
            console.error("Had to adjust region from", regionFromUrl, "to", region);
            url.hostname = `data.${region}.algolia.com`;
            return new Request(url, request.clone());
          }

          return request;
        },
      ],
    });

    // Collections API Tools
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: CollectionsSpec,
      toolFilter,
    });

    // Query Suggestions API Tools
    registerOpenApiTools({
      server,
      dashboardApi,
      openApiSpec: QuerySuggestionsSpec,
      toolFilter,
    });

    // Custom settings Tools
    if (isToolAllowed(SetAttributesForFacetingOperationId, toolFilter)) {
      registerSetAttributesForFaceting(server, dashboardApi);
    }

    if (isToolAllowed(SetCustomRankingOperationId, toolFilter)) {
      registerSetCustomRanking(server, dashboardApi);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}
