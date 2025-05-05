import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { type DashboardApi } from "../DashboardApi.ts";

export const operationId = "getUserInfo";
export const description = "Get information about the user in the Algolia system";

export function registerGetUserInfo(server: CustomMcpServer, dashboardApi: DashboardApi) {
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: true },
    inputSchema: undefined,
    cb: async () => {
      const user = await dashboardApi.getUser();

      return JSON.stringify(user);
    },
  });
}
