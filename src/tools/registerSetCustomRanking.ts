import { algoliasearch } from "algoliasearch";
import type { DashboardApi } from "../DashboardApi.ts";
import type { CustomMcpServer } from "../CustomMcpServer.ts";

export const operationId = "setCustomRanking";
export const description =
  "Set the custom ranking for an Algolia index. This allows you to define how the results are sorted based on the attributes you specify. You can use this to prioritize certain attributes over others when displaying search results.";

export function registerSetCustomRanking(server: CustomMcpServer, dashboardApi: DashboardApi) {
  server.tool({
    name: operationId,
    description,
    annotations: { destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: {
        applicationId: {
          type: "string",
          description: "The application ID that owns the index to manipulate",
        },
        indexName: {
          type: "string",
          description: "The index name on which you want to set the attributes for faceting",
        },
        customRanking: {
          type: "array",
          items: {
            type: "object",
            properties: {
              attribute: {
                type: "string",
                description: "The attribute name",
              },
              direction: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "The direction of the ranking (can be either 'asc' or 'desc')",
              },
            },
            required: ["attribute"],
          },
          description: "The attributes you want to use for custom ranking",
        },
        strategy: {
          type: "string",
          enum: ["append", "replace"],
          default: "append",
          description:
            "If `append`, the attributes will be added to the existing ones (default strategy to avoid overwriting). If `replace`, the existing attributes will be replaced.",
        },
      },
      required: ["applicationId", "indexName", "customRanking"],
    },
    cb: async (args) => {
      const {
        applicationId,
        indexName,
        customRanking,
        strategy = "append",
      } = args as {
        applicationId: string;
        indexName: string;
        customRanking: { attribute: string; direction?: "asc" | "desc" }[];
        strategy?: "append" | "replace";
      };
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
  });
}
