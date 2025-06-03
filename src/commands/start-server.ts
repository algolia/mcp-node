#!/usr/bin/env -S node --experimental-strip-types

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initMCPServer } from "../server/init-server.ts";
import type { StartServerOptions } from "../server/types.ts";
import { ZodError } from "zod";

function formatErrorForCli(error: unknown): string {
  if (error instanceof ZodError) {
    return [...error.errors.map((e) => `- ${e.path.join(".") || "<root>"}: ${e.message}`)].join(
      "\n",
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function startServer(options: StartServerOptions) {
  try {
    const server = await initMCPServer(options);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error(formatErrorForCli(error));
    process.exit(1);
  }
}
