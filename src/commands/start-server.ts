#!/usr/bin/env -S node --experimental-strip-types

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type CliFilteringOptions } from "../toolFilters.ts";
import { initMCPServer } from "../server/init-server.ts";

export type StartServerOptions = CliFilteringOptions;

export async function startServer(opts: StartServerOptions) {
  try {
    const server = await initMCPServer(opts);

    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}
