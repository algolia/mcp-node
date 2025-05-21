import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { startServer } from "./start-server.ts";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { setupServer } from "msw/node";
import { http } from "msw";
import { ZodError } from "zod";
import type { AppState } from "../appState.ts";
import { AppStateManager } from "../appState.ts";
import { REQUIRED_ACLS } from "../DashboardApi.ts";

const mswServer = setupServer();

beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe("when specifying credentials flag", () => {
  it("should throw if params are missing", async () => {
    await expect(
      startServer({
        // @ts-expect-error -- I'm testing missing params
        credentials: { applicationId: "appId" },
      }),
    ).rejects.toThrow(ZodError);
    await expect(
      startServer({
        // @ts-expect-error -- I'm testing missing params
        credentials: { apiKey: "apiKey" },
      }),
    ).rejects.toThrow(ZodError);
  });

  it("should not throw if both params are provided", async () => {
    vi.spyOn(AppStateManager, "load").mockRejectedValue(new Error("Should not be called"));
    const server = await startServer({ credentials: { applicationId: "appId", apiKey: "apiKey" } });

    expect(AppStateManager.load).not.toHaveBeenCalled();

    await server.close();
  });

  it("should allow filtering tools", async () => {
    mswServer.use(
      http.put("https://appid.algolia.net/1/indexes/indexName/settings", () =>
        Response.json({ taskId: 123 }),
      ),
    );
    const client = new Client({ name: "test client", version: "1.0.0" });
    const server = await startServer({
      credentials: {
        apiKey: "apiKey",
        applicationId: "appId",
      },
      allowTools: ["setSettings"],
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const { tools } = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("setSettings");

    const result = await client.callTool({
      name: "setSettings",
      arguments: {
        indexName: "indexName",
        requestBody: {
          searchableAttributes: ["title"],
        },
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "content": [
          {
            "text": "{"taskId":123}",
            "type": "text",
          },
        ],
      }
    `);

    await server.close();
  });
});

describe("default behavior", () => {
  beforeEach(() => {
    const mockAppState: AppState = {
      accessToken: "accessToken",
      refreshToken: "refreshToken",
      apiKeys: {
        appId: "apiKey",
      },
    };
    vi.spyOn(AppStateManager, "load").mockResolvedValue(
      // @ts-expect-error -- It's just a partial mock
      {
        get: vi.fn(<K extends keyof AppState>(k: K) => mockAppState[k]),
        update: vi.fn(),
      },
    );
  });

  it("should list dashboard tools", async () => {
    const client = new Client({ name: "test client", version: "1.0.0" });
    const server = await startServer({});
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    expect(AppStateManager.load).toHaveBeenCalled();

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(176);
    expect(tools.some((t) => t.name === "getUserInfo")).toBe(true);
  });

  it("should fetch the api key automatically", async () => {
    mswServer.use(
      http.get("https://appid-dsn.algolia.net/1/keys/apiKey", () =>
        Response.json({ acl: REQUIRED_ACLS }),
      ),
      http.get("https://appid.algolia.net/1/indexes/indexName/settings", () => Response.json({})),
    );
    const client = new Client({ name: "test client", version: "1.0.0" });
    const server = await startServer({ allowTools: ["getSettings"] });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await client.callTool({
      name: "getSettings",
      arguments: {
        applicationId: "appId",
        indexName: "indexName",
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "content": [
          {
            "text": "{}",
            "type": "text",
          },
        ],
      }
    `);
  });
});
