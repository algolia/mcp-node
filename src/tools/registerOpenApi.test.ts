import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import type { ToolFilter } from "../toolFilters.ts";
import type { DashboardApi } from "../DashboardApi.ts";
import { ALL_SPECS, SearchSpec } from "../openApi.ts";
import { registerOpenApiTools } from "./registerOpenApi.ts";
import { setupServer } from "msw/node";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  CallToolResultSchema,
  ErrorCode,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { InputJsonSchema, ToolDefinition } from "../CustomMcpServer.ts";
import { CustomMcpServer } from "../CustomMcpServer.ts";

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe("registerOpenApiTools", () => {
  it("should generate a working getSettings tool", async () => {
    mswServer.use(
      http.get("https://simba.algolia.net/1/indexes/indexName/settings", () =>
        HttpResponse.json({ searchableAttributes: ["title"] }),
      ),
    );

    const server = new CustomMcpServer({ name: "algolia", version: "1.0.0" });
    const client = new Client({ name: "test client", version: "1.0.0" });

    const dashboardApiMock = {
      getApiKey: vi.fn().mockResolvedValue("apiKey"),
    } as unknown as DashboardApi;

    registerOpenApiTools({
      server,
      dashboardApi: dashboardApiMock,
      openApiSpec: SearchSpec,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    await expect(
      client.request(
        {
          method: "tools/call",
          params: {
            name: "getSettings",
            arguments: {
              applicationId: "SIMBA",
              indexName: "indexName",
            },
          },
        },
        CallToolResultSchema,
      ),
    ).resolves.toMatchInlineSnapshot(`
      {
        "content": [
          {
            "text": "{"searchableAttributes":["title"]}",
            "type": "text",
          },
        ],
      }
    `);
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

    const { cb: toolCallback } = serverMock.tool.mock
      .calls[0][0] as unknown as ToolDefinition<InputJsonSchema>;

    const jsonlResponse = `{ "searchableAttributes": ["title"] }
{ "searchableAttributes": ["genre"] }`;
    mswServer.use(
      http.get("https://appid.algolia.net/1/indexes/indexName/settings", () =>
        HttpResponse.text(jsonlResponse),
      ),
    );
    const result = await toolCallback(
      {
        applicationId: "appId",
        indexName: "indexName",
      },
      // @ts-expect-error - not mocking the extra parameter
      {},
    );

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
    const server = new CustomMcpServer({ name: "algolia", version: "1.0.0" });
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

  it("should not crash when registering ALL tools", async () => {
    const server = new CustomMcpServer({ name: "algolia", version: "1.0.0" });
    const client = new Client({ name: "test client", version: "1.0.0" });

    for (const openApiSpec of ALL_SPECS) {
      registerOpenApiTools({
        server,
        dashboardApi: {} as DashboardApi,
        openApiSpec,
      });
    }

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(172);
  });

  it("should allow filtering tools", async () => {
    const server = new CustomMcpServer({ name: "algolia", version: "1.0.0" });
    const client = new Client({ name: "test client", version: "1.0.0" });

    const dashboardApiMock = {
      getApiKey: vi.fn().mockResolvedValue("apiKey"),
    } as unknown as DashboardApi;

    registerOpenApiTools({
      server,
      dashboardApi: dashboardApiMock,
      openApiSpec: SearchSpec,
      toolFilter: {
        allowedTools: new Set(["getSettings"]),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("getSettings");
  });

  describe("tool arguments validation", () => {
    let client: Client;

    beforeAll(async () => {
      const server = new CustomMcpServer({ name: "algolia", version: "1.0.0" });
      client = new Client({ name: "test client", version: "1.0.0" });

      const dashboardApiMock = {
        getApiKey: vi.fn().mockResolvedValue("someKey"),
      } as unknown as DashboardApi;

      registerOpenApiTools({
        server,
        dashboardApi: dashboardApiMock,
        openApiSpec: SearchSpec,
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    });

    it.each<[operationId: string, description: string, params: object, valid: boolean]>([
      // Valid params
      [
        "searchSingleIndex",
        "query object",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: { query: "hello world" },
        },
        true,
      ],
      [
        "searchSingleIndex",
        "query url",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: { params: "query=hello%20world" },
        },
        true,
      ],
      [
        "searchSingleIndex",
        "complex params",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: { query: "hello world", attributesToRetrieve: [] },
        },
        true,
      ],
      [
        "searchSingleIndex",
        "facetFilters",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: {
            query: "hello world",
            facetFilters: [
              ["attribute1:value", "attribute2:value"],
              "attribute3:value",
              ["attribute4:value", "attribute5:value"],
            ],
          },
        },
        true,
      ],
      [
        "saveRules",
        "simple rule",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: [
            {
              objectID: "1234",
              condition: {
                pattern: "hello world",
                anchor: "end",
                context: "query",
              },
              consequence: {
                promote: [{ objectID: "objectId1", position: 1 }],
              },
            },
          ],
        },
        true,
      ],

      // Invalid params
      [
        "searchSingleIndex",
        "Invalid application id",
        {
          applicationId: 1234,
          indexName: "indexName",
          requestBody: { query: "hello world" },
        },
        false,
      ],
      [
        "searchSingleIndex",
        "Missing index name",
        {
          applicationId: "1234",
          requestBody: { query: "hello world" },
        },
        false,
      ],
      [
        "searchSingleIndex",
        "Invalid query parameter",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: { query: false },
        },
        false,
      ],
      [
        "searchSingleIndex",
        "Extra properties",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: { iDontExist: true },
        },
        false,
      ],
      [
        "searchSingleIndex",
        "invalid facetFilters",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: {
            query: "hello world",
            facetFilters: [["attribute1:value", 2], "attribute3:value"],
          },
        },
        false,
      ],
      [
        "saveRules",
        "Invalid rule",
        {
          applicationId: "1234",
          indexName: "indexName",
          requestBody: [
            {
              objectID: "1234",
              condition: {
                context: "query",
              },
              consequence: {
                promote: [{ objectID: "objectId1", position: false }],
              },
            },
          ],
        },
        false,
      ],
    ])(
      "should validate parameters correctly ($0 - $1)",
      async (operationId, _desc, params, valid) => {
        mswServer.use(http.all(/.+/, () => Response.json({})));

        const error = await client
          .request(
            {
              method: "tools/call",
              params: {
                name: operationId,
                arguments: params,
              },
            },
            CallToolResultSchema,
          )
          .then(
            () => undefined,
            (err) => err,
          );
        const expectedErrorCode = valid ? undefined : ErrorCode.InvalidParams;

        expect(error?.code).toBe(expectedErrorCode);
      },
    );
  });
});
