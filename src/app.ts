import { Command } from "commander";
import { type StartServerOptions } from "./commands/start-server.ts";
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
];
const ALLOW_TOOLS_OPTIONS_TUPLE = [
  "-t, --allow-tools <tools>",
  "Comma separated list of tool ids",
  (val: string) => val.split(",").map((s) => s.trim()),
  DEFAULT_ALLOW_TOOLS,
] as const;

program
  .command("start-server", { isDefault: true })
  .description("Starts the Algolia MCP server")
  .option<string[]>(...ALLOW_TOOLS_OPTIONS_TUPLE)
  .action(async (opts: StartServerOptions) => {
    const { startServer } = await import("./commands/start-server.ts");
    await startServer(opts);
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
  .option<string[]>(...ALLOW_TOOLS_OPTIONS_TUPLE)
  .option("--all", "List all tools")
  .action(async (opts: ListToolsOptions) => {
    const { listTools } = await import("./commands/list-tools.ts");
    await listTools(opts);
  });

program.parse();
