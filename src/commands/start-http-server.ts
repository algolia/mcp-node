import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import type { StartServerOptions } from "../server/types.ts";
import { initMCPServer } from "../server/init-server.ts";
import { CONFIG } from "../config.ts";

export async function startHttpServer(opts: StartServerOptions) {
  try {
    // Create Express application
    const app = express();
    app.use(express.json());
    app.use(
      cors({
        origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
        methods: ["GET", "POST", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    );

    // Store transports by session ID
    const transports: Map<string, StreamableHTTPServerTransport | SSEServerTransport> = new Map();

    // Health check endpoint
    app.get("/health", (_, res) => {
      res.status(200).json({
        status: "ok",
        version: CONFIG.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        connections: transports.size,
      });
    });

    //=============================================================================
    // STREAMABLE HTTP TRANSPORT (PROTOCOL VERSION 2025-03-26)
    //=============================================================================

    // Handle all MCP Streamable HTTP requests (GET, POST, DELETE) on a single endpoint
    app.all("/mcp", async (req: Request, res: Response) => {
      console.log(`Received ${req.method} request to /mcp`);

      try {
        // Check for existing session ID
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId != null && transports.has(sessionId)) {
          // Check if the transport is of the correct type
          const existingTransport = transports.get(sessionId);
          if (existingTransport instanceof StreamableHTTPServerTransport) {
            // Reuse existing transport
            transport = existingTransport;
          } else {
            // Transport exists but is not a StreamableHTTPServerTransport (could be SSEServerTransport)
            res.status(400).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Bad Request: Session exists but uses a different transport protocol",
              },
              id: null,
            });
            return;
          }
        } else if (sessionId == null && req.method === "POST" && isInitializeRequest(req.body)) {
          const eventStore = new InMemoryEventStore();
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            eventStore, // Enable resumability
            onsessioninitialized: (sessionId) => {
              // Store the transport by session ID when session is initialized
              console.log(`StreamableHTTP session initialized with ID: ${sessionId}`);
              transports.set(sessionId, transport);
            },
          });

          // Set up onclose handler to clean up transport when closed
          transport.onclose = () => {
            if (transport.sessionId != null && transports.has(transport.sessionId)) {
              console.log(`Transport closed for HTTP session ${transport.sessionId}, removing from transports map`);
              transports.delete(transport.sessionId);
            }
          };

          // Connect the transport to the MCP server
          const server = await initMCPServer(opts);
          await server.connect(transport);
        } else {
          // Invalid request - no session ID or not initialization request
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          });
          return;
        }

        // Handle the request with the transport
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    //=============================================================================
    // DEPRECATED HTTP+SSE TRANSPORT (PROTOCOL VERSION 2024-11-05)
    //=============================================================================

    app.get("/sse", async (_: Request, res: Response) => {
      console.log("Received GET request to /sse (deprecated SSE transport)");
      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);
      res.on("close", () => {
        if (transport.sessionId != null && transports.has(transport.sessionId)) {
          console.log(`Transport closed for SSE session ${transport.sessionId}, removing from transports map`);
          transports.delete(transport.sessionId);
        }
      });
      const server = await initMCPServer(opts);
      await server.connect(transport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      let transport: SSEServerTransport;
      const existingTransport = transports.get(sessionId);
      if (existingTransport instanceof SSEServerTransport) {
        // Reuse existing transport
        transport = existingTransport;
      } else {
        // Transport exists but is not a SSEServerTransport (could be StreamableHTTPServerTransport)
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: Session exists but uses a different transport protocol",
          },
          id: null,
        });
        return;
      }
      if (transport != null) {
        await transport.handlePostMessage(req, res, req.body);
      } else {
        res.status(400).send({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No transport found for sessionId",
          },
          id: null,
        });
      }
    });

    //=============================================================================
    // END OF SERVER SETUP
    //=============================================================================

    // Error handling
    app.use((err: Error, _: Request, res: Response, __: NextFunction) => {
      console.error("Unhandled exception: ", err.stack);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal Server Error",
        },
        id: null,
      });
    });

    // Graceful shutdown of all connections
    async function closeAllConnections() {
      for (const [sessionId, transport] of transports.entries()) {
        try {
          console.log(`Closing transport for session ${sessionId}`);
          await transport.send({
            jsonrpc: "2.0",
            method: "notifications/shutdown",
          });
          await transport.close();
        } catch (error) {
          console.error(`Error closing transport for session ${sessionId}: `, error);
        }
      }
      transports.clear();
      console.log("All connections closed");
    }

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      console.log(`Graceful shutdown initiated at ${new Date().toISOString()}`);
      await closeAllConnections();
      server.close(() => {
        console.log(`Graceful shutdown complete at ${new Date().toISOString()}`);
        process.exit(0);
      });
    });

    // Handle server shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down server...");
      await closeAllConnections();

      process.exit(0);
    });

    // Start the server
    const PORT = 4243;
    const server = app.listen(PORT, () => {
      console.log(`HTTP MCP server listening on port ${PORT}`);
      console.log(`
        ==============================================
        SUPPORTED TRANSPORT OPTIONS:
        
        1. Streamable Http(Protocol version: 2025-03-26)
           Endpoint: /mcp
           Methods: GET, POST, DELETE
           Usage: 
             - Initialize with POST to /mcp
             - Establish SSE stream with GET to /mcp
             - Send requests with POST to /mcp
             - Terminate session with DELETE to /mcp
        
        2. Http + SSE (Protocol version: 2024-11-05)
           Endpoints: /sse (GET) and /messages (POST)
           Usage:
             - Establish SSE stream with GET to /sse
             - Send requests with POST to /messages?sessionId=<id>
        ==============================================
        `);
    });
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
}
