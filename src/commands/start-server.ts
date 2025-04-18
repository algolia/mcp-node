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
import type { ProcessCallbackParameters, ProcessParameters } from "../tools/registerOpenApi.ts";
import { registerOpenApiTools } from "../tools/registerOpenApi.ts";
import { CONFIG } from "../config.ts";
import {
  ABTestingSpec,
  AnalyticsSpec,
  MonitoringSpec,
  RecommendSpec,
  SearchSpec,
  IngestionSpec,
  UsageSpec,
  CollectionsSpec,
  QuerySuggestionsSpec,
} from "../openApi.ts";
import { type CliFilteringOptions, getToolFilter, isToolAllowed } from "../toolFilters.ts";

export type StartServerOptions = CliFilteringOptions & {
  applicationId?: string;
  apiKey?: string;
};

export async function startServer(opts: StartServerOptions) {
  try {
    if (opts.applicationId && !opts.apiKey) {
      console.error("You need to provide an API key when specifying an application ID");
      process.exit(1);
    } else if (opts.apiKey && !opts.applicationId) {
      console.error("You need to provide an application ID when specifying an API key");
      process.exit(1);
    }

    const toolFilter = getToolFilter(opts);
    const server = new McpServer({
      name: "algolia",
      version: "1.0.0",
      capabilities: {
        resources: {},
        tools: {},
      },
    });

    const processParameters: ProcessParameters = async (parameters) => {
      const result = { ...parameters };

      // Special case for API key which we don't want the AI to fill in (it will be added internally)
      delete result.apiKey;

      // If we got it from the options, we don't need it from the AI
      if (opts.applicationId) {
        delete result.applicationId;
      }

      return result;
    };

    let processCallbackParameters: ProcessCallbackParameters;

    if (opts.applicationId) {
      processCallbackParameters = async (params, securityKeys) => {
        const result = { ...params };

        if (securityKeys.has("applicationId")) {
          result.applicationId = opts.applicationId;
        }

        if (securityKeys.has("apiKey")) {
          result.apiKey = opts.apiKey;
        }

        return result;
      };
    } else {
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

      // Dashboard API Tools
      if (isToolAllowed(GetUserInfoOperationId, toolFilter)) {
        registerGetUserInfo(server, dashboardApi);
      }

      if (isToolAllowed(GetApplicationsOperationId, toolFilter)) {
        registerGetApplications(server, dashboardApi);
      }

      processCallbackParameters = async (params, securityKeys) => {
        const result = { ...params };

        if (!params.applicationId && securityKeys.has("applicationId")) {
          throw new Error("Missing applicationId");
        }

        if (securityKeys.has("apiKey")) {
          params.apiKey = await dashboardApi.getApiKey(params.applicationId);
        }

        return result;
      };
    }

    const openApiSpecs = [
      SearchSpec,
      AnalyticsSpec,
      RecommendSpec,
      ABTestingSpec,
      MonitoringSpec,
      IngestionSpec,
      CollectionsSpec,
      QuerySuggestionsSpec,
    ];

    for (const openApiSpec of openApiSpecs) {
      await registerOpenApiTools({
        server,
        openApiSpec,
        toolFilter,
        processParameters,
        processCallbackParameters,
      });
    }

    await registerOpenApiTools({
      server,
      openApiSpec: UsageSpec,
      toolFilter,
      processParameters,
      processCallbackParameters,
      requestMiddlewares: [
        // The Usage API expects `name` parameter as multiple values rather than comma-separated.
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

    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}
