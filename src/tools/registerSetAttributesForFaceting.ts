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
    .min(1)
    .describe("The list of attributes on which you want to be able to apply category filters"),
};

export function registerSetAttributesForFaceting(server: McpServer, dashboardApi: DashboardApi) {
  server.tool(
    operationId,
    description,
    attributesForFacetingSchema,
    async ({ applicationId, indexName, attributesForFaceting }) => {
      const apiKey = await dashboardApi.getApiKey(applicationId);

      const client = algoliasearch(applicationId, apiKey);

      const task = await client.setSettings({
        indexName,
        indexSettings: {
          attributesForFaceting,
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
              currentSettings.attributesForFaceting != null
                ? `The current attributes for faceting are: ${currentSettings.attributesForFaceting.join(", ")}`
                : "No attributes for faceting found.",
          },
        ],
      };
    },
  );
}
