import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  CallToolResult as BaseCallToolResult,
  ServerNotification,
  ServerRequest,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import type { SomeJSONSchema } from "ajv/dist/types/json-schema.js";

export type InputJsonSchema = Partial<SomeJSONSchema>;

type CallToolResult = string | BaseCallToolResult;
type ToolCallback<Args extends undefined | InputJsonSchema = undefined> =
  Args extends InputJsonSchema
    ? (
        args: object,
        extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
      ) => CallToolResult | Promise<CallToolResult>
    : (
        extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
      ) => CallToolResult | Promise<CallToolResult>;

export type ToolDefinition<T extends InputJsonSchema | undefined = undefined> = {
  name: string;
  inputSchema: T;
  description?: string;
  annotations?: ToolAnnotations;
  cb: ToolCallback<T>;
};

function formatToolError(error: unknown): BaseCallToolResult {
  return {
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

function formatToolResult(result: CallToolResult): BaseCallToolResult {
  if (typeof result === "string") {
    return {
      content: [{ type: "text", text: result }],
    };
  }

  return result;
}

export class CustomMcpServer {
  private readonly server: Server;
  private ajv: Ajv;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tools: Record<string, ToolDefinition<any>> = {};

  constructor(...args: ConstructorParameters<typeof Server>) {
    this.ajv = new Ajv({ removeAdditional: true, strict: false });
    this.server = new Server(...args);

    this.server.assertCanSetRequestHandler(ListToolsRequestSchema.shape.method.value);
    this.server.assertCanSetRequestHandler(CallToolRequestSchema.shape.method.value);
    this.server.registerCapabilities({ tools: { listChanged: true } });

    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      return {
        tools: Object.values(this.tools).map<Tool>((tool) => {
          return {
            name: tool.name,
            description: tool.description,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputSchema: (tool.inputSchema as any) ?? { type: "object" },
            annotations: tool.annotations,
          };
        }),
      };
    });

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, extra): Promise<BaseCallToolResult> => {
        const tool = this.tools[request.params.name];
        if (!tool) {
          throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
        }

        if (tool.inputSchema) {
          const validate = this.ajv.compile(tool.inputSchema);
          const callbackArguments: Record<string, unknown> =
            structuredClone(request.params.arguments) ?? {};

          if (
            "requestBody" in callbackArguments &&
            typeof callbackArguments.requestBody === "string"
          ) {
            callbackArguments.requestBody = JSON.parse(callbackArguments.requestBody);
          }

          const isValid = validate(callbackArguments);
          if (!isValid) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Invalid arguments for tool ${request.params.name}: ${this.ajv.errorsText(validate.errors)}`,
            );
          }

          try {
            const cb = tool.cb as unknown as ToolCallback<InputJsonSchema>;
            return formatToolResult(await cb(callbackArguments, extra));
          } catch (error) {
            return formatToolError(error);
          }
        }

        try {
          const cb = tool.cb as unknown as ToolCallback<undefined>;
          return formatToolResult(await cb(extra));
        } catch (error) {
          return formatToolError(error);
        }
      },
    );
  }

  async connect(transport: Transport): Promise<void> {
    return await this.server.connect(transport);
  }

  async close(): Promise<void> {
    await this.server.close();
  }

  tool<T extends InputJsonSchema | undefined>(options: ToolDefinition<T>) {
    if (this.tools[options.name]) {
      throw new Error(`Tool with name ${options.name} already exists`);
    }

    this.tools[options.name] = options;
    this.sendToolListChanged();
  }

  private sendToolListChanged() {
    if (this.server.transport) {
      this.server.sendToolListChanged();
    }
  }
}
