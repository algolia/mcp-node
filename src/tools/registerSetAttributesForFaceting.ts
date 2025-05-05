import { algoliasearch } from "algoliasearch";
import type { DashboardApi } from "../DashboardApi.ts";
import type { CustomMcpServer } from "../CustomMcpServer.ts";

export const operationId = "setAttributesForFaceting";
export const description =
  "lets you create categories based on specific attributes so users can filter search results by those categories. For example, if you have an index of books, you could categorize them by author and genre. This allows users to filter search results by their favorite author or discover new genres. To enable this categorization, declare your attributes as `attributesForFaceting`";

export function registerSetAttributesForFaceting(
  server: CustomMcpServer,
  dashboardApi: DashboardApi,
) {
  server.tool({
    name: operationId,
    description,
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
        attributesForFaceting: {
          type: "array",
          description:
            "The list of attributes on which you want to be able to apply category filters",
          items: { type: "string" },
        },
        strategy: {
          type: "string",
          description:
            "If `append`, the attributes will be added to the existing ones (default strategy to avoid overwriting). If `replace`, the existing attributes will be replaced.",
          enum: ["append", "replace"],
          default: "append",
        },
      },
      required: ["applicationId", "indexName", "attributesForFaceting"],
    },
    annotations: { destructiveHint: true },
    cb: async (args) => {
      const {
        applicationId,
        indexName,
        attributesForFaceting,
        strategy = "append",
      } = args as {
        applicationId: string;
        indexName: string;
        attributesForFaceting: string[];
        strategy?: "append" | "replace";
      };
      const apiKey = await dashboardApi.getApiKey(applicationId);
      const client = algoliasearch(applicationId, apiKey);

      let newAttributes: string[] = [];
      if (strategy === "append") {
        const currentSettings = await client.getSettings({ indexName });

        newAttributes = currentSettings.attributesForFaceting || [];
      }

      newAttributes = [...newAttributes, ...attributesForFaceting];

      const task = await client.setSettings({
        indexName,
        indexSettings: {
          attributesForFaceting: newAttributes,
        },
      });

      return `The task to set the attributes for faceting has been created. You can check the status of the task using the \`waitForTask\` method over the task ID '${task.taskID}' and on the index '${indexName}'`;
    },
  });
}
