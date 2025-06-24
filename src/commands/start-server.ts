#!/usr/bin/env -S node --experimental-strip-types

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
import type {
  ProcessCallbackArguments,
  ProcessInputSchema,
  RequestMiddleware,
} from "../tools/registerOpenApi.ts";
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
import { CliFilteringOptionsSchema, getToolFilter, isToolAllowed } from "../toolFilters.ts";
import {
  operationId as SetAttributesForFacetingOperationId,
  registerSetAttributesForFaceting,
} from "../tools/registerSetAttributesForFaceting.ts";
import {
  registerSetCustomRanking,
  operationId as SetCustomRankingOperationId,
} from "../tools/registerSetCustomRanking.ts";

import { CustomMcpServer } from "../CustomMcpServer.ts";
import { z } from "zod";

export const StartServerOptionsSchema = CliFilteringOptionsSchema.extend({
  credentials: z
    .array(
      z.object({
        applicationId: z.string(),
        apiKey: z.string(),
      })
    )
    .optional(),
});

type StartServerOptions = z.infer<typeof StartServerOptionsSchema>;

function makeRegionRequestMiddleware(dashboardApi: DashboardApi): RequestMiddleware {
  return async ({ request, params }) => {
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
  };
}

export async function startServer(options: StartServerOptions): Promise<CustomMcpServer> {
  const { credentials, ...opts } = StartServerOptionsSchema.parse(options);
  const toolFilter = getToolFilter(opts);

  const server = new CustomMcpServer({
    name: "algolia",
    version: CONFIG.version,
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  const regionHotFixMiddlewares: RequestMiddleware[] = [];
  let processCallbackArguments: ProcessCallbackArguments;
  const processInputSchema: ProcessInputSchema = (inputSchema) => {
    // Keep the applicationId parameter so the AI can specify which application to use
    // when multiple credentials are provided
    return inputSchema;
  };

  if (credentials && credentials.length > 0) {
    processCallbackArguments = async (params, securityKeys) => {
      const result = { ...params };

      if (securityKeys.has("applicationId")) {
        // Find the credential that matches the requested applicationId
        const requestedAppId = params.applicationId;
        const matchingCredential = credentials.find(cred => cred.applicationId === requestedAppId);
        
        if (matchingCredential) {
          result.applicationId = matchingCredential.applicationId;
          
          if (securityKeys.has("apiKey")) {
            result.apiKey = matchingCredential.apiKey;
          }
        } else {
          // If no matching credential found, use the first one as fallback
          console.warn(`No credentials found for applicationId: ${requestedAppId}, using first available credential`);
          result.applicationId = credentials[0].applicationId;
          
          if (securityKeys.has("apiKey")) {
            result.apiKey = credentials[0].apiKey;
          }
        }
      } else if (securityKeys.has("apiKey")) {
        // If no applicationId is specified, use the first credential
        result.applicationId = credentials[0].applicationId;
        result.apiKey = credentials[0].apiKey;
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

    const dashboardApi = new DashboardApi({ baseUrl: CONFIG.dashboardApiBaseUrl, appState });

    processCallbackArguments = async (params, securityKeys) => {
      const result = { ...params };

      if (securityKeys.has("apiKey")) {
        result.apiKey = await dashboardApi.getApiKey(params.applicationId);
      }

      return result;
    };

    regionHotFixMiddlewares.push(makeRegionRequestMiddleware(dashboardApi));

    // Dashboard API Tools
    if (isToolAllowed(GetUserInfoOperationId, toolFilter)) {
      registerGetUserInfo(server, dashboardApi);
    }

    if (isToolAllowed(GetApplicationsOperationId, toolFilter)) {
      registerGetApplications(server, dashboardApi);
    }

    // TODO: Make it available when with applicationId+apiKey mode too
    if (isToolAllowed(SetAttributesForFacetingOperationId, toolFilter)) {
      registerSetAttributesForFaceting(server, dashboardApi);
    }

    if (isToolAllowed(SetCustomRankingOperationId, toolFilter)) {
      registerSetCustomRanking(server, dashboardApi);
    }
  }

  for (const openApiSpec of [
    SearchSpec,
    AnalyticsSpec,
    RecommendSpec,
    ABTestingSpec,
    MonitoringSpec,
    CollectionsSpec,
    QuerySuggestionsSpec,
  ]) {
    registerOpenApiTools({
      server,
      processInputSchema,
      processCallbackArguments,
      openApiSpec,
      toolFilter,
    });
  }

  // Usage
  registerOpenApiTools({
    server,
    processInputSchema,
    processCallbackArguments,
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
    processInputSchema,
    processCallbackArguments,
    openApiSpec: IngestionSpec,
    toolFilter,
    requestMiddlewares: [
      // Dirty fix for Claud hallucinating regions
      ...regionHotFixMiddlewares,
    ],
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
