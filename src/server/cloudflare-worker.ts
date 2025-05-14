import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AlgoliaOAuthHandler } from "./auth-handler.ts";
import { getToolFilter, isToolAllowed } from "../toolFilters.ts";
import {
  operationId as GetUserInfoOperationId,
  registerGetUserInfo,
} from "../tools/registerGetUserInfo.ts";
import {
  operationId as GetApplicationsOperationId,
  registerGetApplications,
} from "../tools/registerGetApplications.ts";
import { registerOpenApiTools } from "../tools/registerOpenApi.ts";
import {
  ABTestingSpec,
  AnalyticsSpec,
  CollectionsSpec,
  IngestionSpec,
  MonitoringSpec,
  QuerySuggestionsSpec,
  RecommendSpec,
  // SearchSpec,
  UsageSpec,
} from "../openApi.ts";
import {
  operationId as SetAttributesForFacetingOperationId,
  registerSetAttributesForFaceting,
} from "../tools/registerSetAttributesForFaceting.ts";
import {
  operationId as SetCustomRankingOperationId,
  registerSetCustomRanking,
} from "../tools/registerSetCustomRanking.ts";
import { DashboardApi } from "../DashboardApi.ts";
import { CONFIG } from "../config.ts";
import { InMemoryStateManager } from "../appState.ts";
import type { Props } from "./utils.ts";

export class AlgoliaMCP extends McpAgent<Env, never, Props> {
  server = new McpServer({
    name: "Algolia MCP on Cloudflare",
    version: CONFIG.version,
  });
  dashboardApi: DashboardApi | undefined;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async init() {
    console.log("Algolia MCP init: ", this.props);

    this.dashboardApi = new DashboardApi({
      baseUrl: CONFIG.dashboardApiBaseUrl,
      appState: new InMemoryStateManager({
        accessToken: this.props.accessToken,
        refreshToken: this.props.refreshToken,
        apiKeys: this.props.apiKeys,
      }),
    });

    const toolFilter = getToolFilter({});

    console.log("Tool filter:", toolFilter);

    // Dashboard API Tools
    if (isToolAllowed(GetUserInfoOperationId, toolFilter)) {
      registerGetUserInfo(this.server, this.dashboardApi);
      console.log("Registered GetUserInfo tool");
    }

    if (isToolAllowed(GetApplicationsOperationId, toolFilter)) {
      registerGetApplications(this.server, this.dashboardApi);
      console.log("Registered GetApplications tool");
    }
    //
    // // Search API Tools
    // registerOpenApiTools({
    //   server: this.server,
    //   dashboardApi: this.dashboardApi,
    //   openApiSpec: SearchSpec,
    //   toolFilter,
    // });
    // console.log("Registered Search API tools");

    // Analytics API Tools
    registerOpenApiTools({
      server: this.server,
      dashboardApi: this.dashboardApi,
      openApiSpec: AnalyticsSpec,
      toolFilter,
    });
    console.log("Registered Analytics API tools");

    // Recommend API Tools
    registerOpenApiTools({
      server: this.server,
      dashboardApi: this.dashboardApi,
      openApiSpec: RecommendSpec,
      toolFilter,
    });
    console.log("Registered Recommend API tools");

    // AB Testing
    registerOpenApiTools({
      server: this.server,
      dashboardApi: this.dashboardApi,
      openApiSpec: ABTestingSpec,
      toolFilter,
    });
    console.log("Registered AB Testing API tools");

    // Monitoring API Tools
    registerOpenApiTools({
      server: this.server,
      dashboardApi: this.dashboardApi,
      openApiSpec: MonitoringSpec,
      toolFilter,
    });
    console.log("Registered Monitoring API tools");

    // Usage
    registerOpenApiTools({
      server: this.server,
      dashboardApi: this.dashboardApi,
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
    console.log("Registered Usage API tools");

    // Ingestion API Tools
    registerOpenApiTools({
      server: this.server,
      dashboardApi: this.dashboardApi,
      openApiSpec: IngestionSpec,
      toolFilter,
      requestMiddlewares: [
        // Dirty fix for Claud hallucinating regions
        async ({ request, params }) => {
          if (this.dashboardApi == null) {
            throw new Error("Dashboard API is not initialized");
          }

          const application = await this.dashboardApi.getApplication(params.applicationId);
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
    console.log("Registered Ingestion API tools");

    // Collections API Tools
    registerOpenApiTools({
      server: this.server,
      dashboardApi: this.dashboardApi,
      openApiSpec: CollectionsSpec,
      toolFilter,
    });
    console.log("Registered Collections API tools");

    // Query Suggestions API Tools
    registerOpenApiTools({
      server: this.server,
      dashboardApi: this.dashboardApi,
      openApiSpec: QuerySuggestionsSpec,
      toolFilter,
    });
    console.log("Registered Query Suggestions API tools");

    // Custom settings Tools
    if (isToolAllowed(SetAttributesForFacetingOperationId, toolFilter)) {
      registerSetAttributesForFaceting(this.server, this.dashboardApi);
      console.log("Registered SetAttributesForFaceting tool");
    }

    if (isToolAllowed(SetCustomRankingOperationId, toolFilter)) {
      registerSetCustomRanking(this.server, this.dashboardApi);
      console.log("Registered SetCustomRanking tool");
    }
  }
}

export default new OAuthProvider({
  apiHandlers: {
    "/sse": AlgoliaMCP.serveSSE("/sse") as never,
    "/mcp": AlgoliaMCP.serve("/mcp") as never,
  },
  defaultHandler: AlgoliaOAuthHandler as never,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  onError: (error) => {
    console.error("Error in OAuth Provider:", error);
  },
});
