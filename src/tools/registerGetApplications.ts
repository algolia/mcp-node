import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type DashboardApi } from "../DashboardApi.ts";

export const operationId = "getApplications";
export const description = "Gets a paginated list of Algolia applications for the current user";

export function registerGetApplications(server: McpServer, dashboardApi: DashboardApi) {
  server.tool(operationId, description, { readOnlyHint: true }, async () => {
    const applications = await dashboardApi.getApplications();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(applications),
        },
      ],
    };
  });
}
