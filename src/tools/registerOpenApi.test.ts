import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import type { ToolFilter } from "../toolFilters.ts";
import type { DashboardApi } from "../DashboardApi.ts";
import { SearchSpec } from "../openApi.ts";
import { registerOpenApiTools } from "./registerOpenApi.ts";
import { setupServer } from "msw/node";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("registerOpenApiTools", () => {
  it("should generate a getSettings tool", async () => {
    const toolFilter: ToolFilter = {
      allowedTools: new Set(["getSettings"]),
    };

    const serverMock = { tool: vi.fn() };
    const dashboardApiMock = {
      getApiKey: vi.fn().mockResolvedValue("apiKey"),
    };

    registerOpenApiTools({
      server: serverMock,
      dashboardApi: dashboardApiMock as unknown as DashboardApi,
      openApiSpec: SearchSpec,
      toolFilter,
    });

    expect(serverMock.tool).toHaveBeenCalledTimes(1);
    expect(serverMock.tool).toHaveBeenCalledWith(
      "getSettings",
      "Retrieve index settings",
      expect.objectContaining({
        applicationId: expect.anything(),
        indexName: expect.anything(),
      }),
      expect.anything(),
    );

    const toolCallback = serverMock.tool.mock.calls[0][3];

    server.use(
      http.get("https://appid.algolia.net/1/indexes/indexName/settings", () =>
        HttpResponse.json({ searchableAttributes: ["title"] }),
      ),
    );
    const result = await toolCallback({
      applicationId: "appId",
      indexName: "indexName",
    });

    expect(result).toEqual({
      content: [
        {
          text: '{"searchableAttributes":["title"]}',
          type: "text",
        },
      ],
    });
  });

  it("should work with jsonl responses", async () => {
    const toolFilter: ToolFilter = {
      allowedTools: new Set(["getSettings"]),
    };

    const serverMock = { tool: vi.fn() };
    const dashboardApiMock = {
      getApiKey: vi.fn().mockResolvedValue("apiKey"),
    };

    registerOpenApiTools({
      server: serverMock,
      dashboardApi: dashboardApiMock as unknown as DashboardApi,
      openApiSpec: SearchSpec,
      toolFilter,
    });

    expect(serverMock.tool).toHaveBeenCalledTimes(1);
    expect(serverMock.tool).toHaveBeenCalledWith(
      "getSettings",
      "Retrieve index settings",
      expect.objectContaining({
        applicationId: expect.anything(),
        indexName: expect.anything(),
      }),
      expect.anything(),
    );

    const toolCallback = serverMock.tool.mock.calls[0][3];

    const jsonlResponse = `{ "searchableAttributes": ["title"] }
{ "searchableAttributes": ["genre"] }`;
    server.use(
      http.get("https://appid.algolia.net/1/indexes/indexName/settings", () =>
        HttpResponse.text(jsonlResponse),
      ),
    );
    const result = await toolCallback({
      applicationId: "appId",
      indexName: "indexName",
    });

    expect(result).toEqual({
      content: [
        {
          text: jsonlResponse,
          type: "text",
        },
      ],
    });
  });
});
