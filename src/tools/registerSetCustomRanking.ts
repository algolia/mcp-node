import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { algoliasearch } from "algoliasearch";
import { z } from "zod";
import type { DashboardApi } from "../DashboardApi.ts";

export const operationId = "setCustomRanking";
export const description =
  "Set the custom ranking for an Algolia index. This allows you to define how the results are sorted based on the attributes you specify. You can use this to prioritize certain attributes over others when displaying search results.";

const setCustomRankingSchema = {
  applicationId: z.string().describe("The application ID that owns the index to manipulate"),
  indexName: z
    .string()
    .describe("The index name on which you want to set the attributes for faceting"),
  customRanking: z
    .array(
      z.object({
        attribute: z.string().describe("The attribute name"),
        direction: z
          .enum(["asc", "desc"])
          .optional()
          .default("desc")
          .describe("The direction of the ranking (can be either 'asc' or 'desc')"),
      }),
    )
    .min(1)
    .describe("The attributes you want to use for custom ranking"),
};

export function registerSetCustomRanking(server: McpServer, dashboardApi: DashboardApi) {
  server.tool(
    operationId,
    description,
    setCustomRankingSchema,
    async ({ applicationId, indexName, customRanking }) => {
      const apiKey = await dashboardApi.getApiKey(applicationId);

      const client = algoliasearch(applicationId, apiKey);

      const task = await client.setSettings({
        indexName,
        indexSettings: {
          customRanking: customRanking.map(
            ({ attribute, direction }) => `${direction}(${attribute})`,
          ),
        },
      });

      await client.waitForTask({ indexName, taskID: task.taskID });

      const currentSettings = await client.getSettings({
        indexName,
      });

      return {
        content: [
          {
            type: "text",
            text:
              currentSettings.customRanking != null
                ? `The current attributes used for custom ranking: ${currentSettings.customRanking.join(", ")}`
                : "No attributes for faceting found.",
          },
        ],
      };
    },
  );
}
