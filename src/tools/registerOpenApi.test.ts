import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import type { ToolFilter } from "../toolFilters.ts";
import type { DashboardApi } from "../DashboardApi.ts";
import { SearchSpec } from "../openApi.ts";
import { registerOpenApiTools } from "./registerOpenApi.ts";
import { setupServer } from "msw/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

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
      expect.anything(),
    );

    const [_name, _description, _schema, _annotations, toolCallback] =
      serverMock.tool.mock.calls[0];

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

    const [_name, _description, _schema, _annotations, toolCallback] =
      serverMock.tool.mock.calls[0];

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

  it("should generate annotations hints", async () => {
    const server = new McpServer({ name: "algolia", version: "1.0.0" });
    const client = new Client({ name: "test client", version: "1.0.0" });

    registerOpenApiTools({
      server,
      dashboardApi: {} as DashboardApi,
      openApiSpec: SearchSpec,
      toolFilter: {
        allowedTools: new Set(["getSettings", "setSettings", "browse"]),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const listResult = await client.request({ method: "tools/list" }, ListToolsResultSchema);

    expect(listResult.tools).toHaveLength(3);

    const [browseTool, getSettingsTool, setSettingsTool] = listResult.tools;

    // Browse tool uses the http post method, but has the x-use-read-transporter set to true
    expect(browseTool.name).toBe("browse");
    expect(browseTool.annotations).toEqual({ destructiveHint: false, readOnlyHint: true });

    // get settings uses the http get method
    expect(getSettingsTool.name).toBe("getSettings");
    expect(getSettingsTool.annotations).toEqual({ destructiveHint: false, readOnlyHint: true });

    // set settings uses the http post method
    expect(setSettingsTool.name).toBe("setSettings");
    expect(setSettingsTool.annotations).toEqual({ destructiveHint: true, readOnlyHint: false });
  });
});
