import { type DashboardApi } from "../DashboardApi.ts";
import type { CustomMcpServer } from "../CustomMcpServer.ts";

export const operationId = "getApplications";
export const description = "Gets a paginated list of Algolia applications for the current user";

export function registerGetApplications(server: CustomMcpServer, dashboardApi: DashboardApi) {
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: true },
    inputSchema: undefined,
    cb: async () => {
      const applications = await dashboardApi.getApplications();
      return JSON.stringify(applications);
    },
  });
}
