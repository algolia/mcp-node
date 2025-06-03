import { Command } from "commander";
import { type ListToolsOptions } from "./commands/list-tools.ts";

const program = new Command("algolia-mcp");

const DEFAULT_ALLOW_TOOLS = [
  // Dashboard API Tools
  "getUserInfo",
  "getApplications",
  // Search
  "listIndices",
  "getSettings",
  "searchSingleIndex",
  "searchRules",
  "searchSynonyms",
  "saveObject",
  "batch",
  "multipleBatch",
  "partialUpdateObject",
  "deleteByQuery",
  // Analytics
  "getTopSearches",
  "getTopHits",
  "getNoResultsRate",
  // AB Testing
  "listABTests",
  // Monitoring
  "getClustersStatus",
  "getIncidents",
  // Ingestion
  "listTransformations",
  "listTasks",
  "listDestinations",
  "listSources",
  // Usage
  "retrieveMetricsRegistry",
  "retrieveMetricsDaily",
  "retrieveApplicationMetricsHourly",
  // Collections
  "listCollections",
  "getCollection",
  // Query Suggestions
  "listQuerySuggestionsConfigs",
  "getQuerySuggestionsConfig",
  "createQuerySuggestionsConfig",
  "updateQuerySuggestionsConfig",
  "getQuerySuggestionConfigStatus",
  "getQuerySuggestionLogFile",
  // Custom settings
  "setAttributesForFaceting",
  "setCustomRanking",
];
const ALLOW_TOOLS_OPTIONS_TUPLE = [
  "-t, --allow-tools <tools>",
  "Comma separated list of tool ids (or all)",
  (val: string) => {
    if (val.trim().toLowerCase() === "all") {
      return [];
    }
    return val.split(",").map((tool) => tool.trim());
  },
  DEFAULT_ALLOW_TOOLS,
] as const;

program
  .command("start-server", { isDefault: true })
  .description("Starts the Algolia MCP server")
  .option<string[] | undefined>(...ALLOW_TOOLS_OPTIONS_TUPLE)
  .option(
    "--credentials <applicationId:apiKey>",
    "Application ID and associated API key to use. Optional: the MCP will authenticate you if unspecified, giving you access to all your applications.",
    (val) => {
      const [applicationId, apiKey] = val.split(":");
      if (!applicationId || !apiKey) {
        throw new Error("Invalid credentials format. Use applicationId:apiKey");
      }
      return { applicationId, apiKey };
    },
  )

  .option("--transport [stdio|http]", "Transport type, either `stdio` (default) or `http`", "stdio")
  .action(async (opts) => {
    switch (opts.transport) {
      case "stdio": {
        const { startServer } = await import("./commands/start-server.ts");
        await startServer(opts);
        break;
      }
      case "http": {
        console.info('Starting server with HTTP transport support');
        const { startHttpServer } = await import("./commands/start-http-server.ts");
        await startHttpServer(opts);
        break;
      }
      default:
        console.error(`Unknown transport type: ${opts.transport}\nAllowed values: stdio, http`);
        process.exit(1);
    }
  });

program
  .command("authenticate")
  .description("Authenticate with Algolia")
  .action(async () => {
    const { authenticate } = await import("./commands/authenticate.ts");
    await authenticate();
  });

program
  .command("logout")
  .description("Remove all stored credentials")
  .action(async () => {
    const { logout } = await import("./commands/logout.ts");
    await logout();
  });

program
  .command("list-tools")
  .description("List available tools")
  .option<string[] | undefined>(...ALLOW_TOOLS_OPTIONS_TUPLE)
  .option("--all", "List all tools")
  .action(async (opts: ListToolsOptions) => {
    const { listTools } = await import("./commands/list-tools.ts");
    await listTools(opts);
  });

program.parse();
