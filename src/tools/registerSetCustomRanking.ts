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
    .describe("The attributes you want to use for custom ranking"),
  strategy: z
    .enum(["append", "replace"])
    .optional()
    .default("append")
    .describe(
      "If `append`, the attributes will be added to the existing ones (default strategy to avoid overwriting). If `replace`, the existing attributes will be replaced.",
    ),
};

export function registerSetCustomRanking(server: McpServer, dashboardApi: DashboardApi) {
  server.tool(
    operationId,
    description,
    setCustomRankingSchema,
    { destructiveHint: true },
    async ({ applicationId, indexName, customRanking, strategy }) => {
      const apiKey = await dashboardApi.getApiKey(applicationId);
      const client = algoliasearch(applicationId, apiKey);

      let newCustomRanking: string[] = [];

      if (strategy === "append") {
        const currentSettings = await client.getSettings({
          indexName,
        });

        newCustomRanking = currentSettings.customRanking || [];
      }

      newCustomRanking = [
        ...newCustomRanking,
        ...customRanking.map(({ attribute, direction }) => `${direction}(${attribute})`),
      ];

      const task = await client.setSettings({
        indexName,
        indexSettings: {
          customRanking: newCustomRanking,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `The task to set the custom ranking has been created. You can check the status of the task using the \`waitForTask\` method over the task ID '${task.taskID}' and on the index '${indexName}'`,
          },
        ],
      };
    },
  );
}
