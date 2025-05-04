import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type DashboardApi } from "../DashboardApi.ts";

export const operationId = "getUserInfo";
export const description = "Get information about the user in the Algolia system";

export function registerGetUserInfo(server: McpServer, dashboardApi: DashboardApi) {
  server.tool(operationId, description, { readOnlyHint: true }, async () => {
    const user = await dashboardApi.getUser();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(user),
        },
      ],
    };
  });
}
