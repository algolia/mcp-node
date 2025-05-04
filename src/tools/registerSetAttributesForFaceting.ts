import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { algoliasearch } from "algoliasearch";
import { z } from "zod";
import type { DashboardApi } from "../DashboardApi.ts";

export const operationId = "setAttributesForFaceting";
export const description =
  "lets you create categories based on specific attributes so users can filter search results by those categories. For example, if you have an index of books, you could categorize them by author and genre. This allows users to filter search results by their favorite author or discover new genres. To enable this categorization, declare your attributes as `attributesForFaceting`";

const attributesForFacetingSchema = {
  applicationId: z.string().describe("The application ID that owns the index to manipulate"),
  indexName: z
    .string()
    .describe("The index name on which you want to set the attributes for faceting"),
  attributesForFaceting: z
    .array(z.string())
    .describe("The list of attributes on which you want to be able to apply category filters"),
  strategy: z
    .enum(["append", "replace"])
    .optional()
    .default("append")
    .describe(
      "If `append`, the attributes will be added to the existing ones (default strategy to avoid overwriting). If `replace`, the existing attributes will be replaced.",
    ),
};

export function registerSetAttributesForFaceting(server: McpServer, dashboardApi: DashboardApi) {
  server.tool(
    operationId,
    description,
    attributesForFacetingSchema,
    { destructiveHint: true },
    async ({ applicationId, indexName, attributesForFaceting, strategy }) => {
      const apiKey = await dashboardApi.getApiKey(applicationId);
      const client = algoliasearch(applicationId, apiKey);

      let newAttributes: string[] = [];
      if (strategy === "append") {
        const currentSettings = await client.getSettings({
          indexName,
        });

        newAttributes = currentSettings.attributesForFaceting || [];
      }

      newAttributes = [...newAttributes, ...attributesForFaceting];

      const task = await client.setSettings({
        indexName,
        indexSettings: {
          attributesForFaceting: newAttributes,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: `The task to set the attributes for faceting has been created. You can check the status of the task using the \`waitForTask\` method over the task ID '${task.taskID}' and on the index '${indexName}'`,
          },
        ],
      };
    },
  );
}
