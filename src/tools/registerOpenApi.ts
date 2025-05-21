import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import type { Methods, OpenApiSpec, Operation, Parameter, SecurityScheme } from "../openApi.ts";
import { CONFIG } from "../config.ts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { CustomMcpServer, InputJsonSchema } from "../CustomMcpServer.ts";
import type { SomeJSONSchema } from "ajv/dist/types/json-schema.js";

export type RequestMiddleware = (opts: {
  request: Request;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
}) => Promise<Request>;

export type ProcessInputSchema = (inputSchema: InputJsonSchema) => InputJsonSchema;
export type ProcessCallbackArguments = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>,
  securityKeys: Set<string>,
) => Promise<object>;

type OpenApiToolsOptions = {
  server: Pick<CustomMcpServer, "tool">;
  openApiSpec: OpenApiSpec;
  toolFilter?: ToolFilter;
  requestMiddlewares?: Array<RequestMiddleware>;
  processInputSchema?: ProcessInputSchema;
  processCallbackArguments?: ProcessCallbackArguments;
};

export async function registerOpenApiTools({
  server,
  openApiSpec,
  toolFilter,
  requestMiddlewares,
  processCallbackArguments,
  processInputSchema,
}: OpenApiToolsOptions) {
  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!isToolAllowed(operation.operationId, toolFilter)) continue;
      if (operation["x-helper"]) continue;

      const securityKeys = new Set(
        [...(openApiSpec.security ?? []), ...(operation.security ?? [])].flatMap((item) =>
          Object.keys(item),
        ),
      );
      const securitySchemes = openApiSpec.components?.securitySchemes ?? {};

      const toolCallback = buildToolCallback({
        path,
        openApiSpec,
        method: method as Methods,
        operation,
        processCallbackArguments,
        requestMiddlewares,
        securityKeys,
      });

      const isReadOnly = Boolean(method === "get" || operation["x-use-read-transporter"]);
      const inputSchema: InputJsonSchema = {
        type: "object",
        properties: {},
        required: [],
        $defs: {},
      };

      addSecurityParametersToInputSchema(inputSchema, securityKeys, securitySchemes);
      addUrlParametersToInputSchema(inputSchema, openApiSpec.servers);
      addParametersToInputSchema(inputSchema, operation, openApiSpec);

      addDefinitionsToInputSchema(inputSchema, openApiSpec);
      inputSchema.required = [...new Set(inputSchema.required)];
      processInputSchema?.(inputSchema);

      server.tool({
        name: operation.operationId,
        description: operation.summary || operation.description || "",
        annotations: { destructiveHint: !isReadOnly, readOnlyHint: isReadOnly },
        inputSchema,
        cb: toolCallback,
      });
    }
  }
}

type ToolCallbackBuildOptions = {
  path: string;
  openApiSpec: OpenApiSpec;
  method: Methods;
  operation: Operation;
  securityKeys: Set<string>;
  processCallbackArguments?: ProcessCallbackArguments;
  requestMiddlewares?: Array<RequestMiddleware>;
};

function buildToolCallback({
  path,
  openApiSpec,
  method,
  operation,
  requestMiddlewares,
  securityKeys,
  processCallbackArguments,
}: ToolCallbackBuildOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (params: Record<string, any>): Promise<CallToolResult> => {
    // eslint-disable-next-line no-param-reassign
    params = processCallbackArguments
      ? await processCallbackArguments(params, securityKeys)
      : params;

    const { requestBody } = params;

    if (method === "get" && requestBody) {
      throw new Error("requestBody is not supported for GET requests");
    }

    const serverBaseUrl = openApiSpec.servers[0].url;
    const preparedUrl = serverBaseUrl.replace(/{([^}]+)}/g, (_, key) => params[key]);
    const url = new URL(preparedUrl);
    url.pathname = path.replace(/{([^}]+)}/g, (_, key) => params[key]);

    if (operation.parameters) {
      for (const parameter of operation.parameters) {
        const resolvedParameter =
          "$ref" in parameter ? resolveRef<Parameter>(openApiSpec, parameter.$ref) : parameter;
        if (resolvedParameter.in !== "query") continue;
        // TODO: throw error if param is required and not in callbackParams
        if (!(resolvedParameter.name in params)) continue;
        url.searchParams.set(resolvedParameter.name, params[resolvedParameter.name]);
      }
    }

    const body = requestBody
      ? // Claude likes to send me JSON already serialized as a string...
        isJsonString(requestBody)
        ? requestBody
        : JSON.stringify(requestBody)
      : undefined;

    let request = new Request(url.toString(), { method, body });

    if (securityKeys.size) {
      const securitySchemes = openApiSpec.components?.securitySchemes ?? {};
      for (const key of securityKeys) {
        const securityScheme = securitySchemes[key];

        if (!securityScheme) {
          throw new Error(`Security scheme ${key} not found`);
        } else if (securityScheme.type !== "apiKey") {
          throw new Error(`Unsupported security scheme type: ${securityScheme.type}`);
        }

        const value: string = params[key];

        if (!value) {
          throw new Error(`Missing security parameter: ${key}`);
        }

        switch (securityScheme.in) {
          case "header":
            request.headers.set(securityScheme.name, value);
            break;
          case "query":
            url.searchParams.set(securityScheme.name, value);
            break;
          default:
            throw new Error(`Unsupported security scheme in: ${securityScheme.in}`);
        }
      }
    }

    request.headers.append("User-Agent", CONFIG.userAgent);

    if (requestMiddlewares?.length) {
      for (const middleware of requestMiddlewares) {
        request = await middleware({ request, params });
      }
    }

    const response = await fetch(request);
    const text = await response.text();

    return {
      content: [{ type: "text", text }],
    };
  };
}

function isJsonString(json: unknown): json is string {
  if (typeof json !== "string") return false;

  try {
    JSON.parse(json);
    return true;
  } catch {
    // It wasn't valid JSON
  }

  return false;
}

function addUrlParametersToInputSchema(
  inputSchema: InputJsonSchema,
  servers: OpenApiSpec["servers"],
) {
  const vars = servers[0].variables || {};

  for (const [name, urlVariable] of Object.entries(vars)) {
    inputSchema.properties[name] = {
      type: "string",
      description: urlVariable.description,
    };
    inputSchema.required.push(name);
  }
}

function addSecurityParametersToInputSchema(
  inputSchema: InputJsonSchema,
  securityKeys: Set<string>,
  securitySchemes: Record<string, SecurityScheme>,
) {
  for (const key of securityKeys) {
    // Special case for API key which we don't want the AI to fill in (it will be added internally)
    if (key === "apiKey") continue;
    if (!securitySchemes[key]) continue;

    inputSchema.properties[key] = {
      type: "string",
      description: securitySchemes[key].description,
    };
    inputSchema.required.push(key);
  }
}

function addParametersToInputSchema(
  inputSchema: InputJsonSchema,
  operation: Operation,
  spec: OpenApiSpec,
) {
  const requestBody = operation.requestBody?.content["application/json"];
  if (requestBody) {
    const bodySchema = structuredClone(
      typeof requestBody.schema.$ref === "string"
        ? resolveRef<SomeJSONSchema>(spec, requestBody.schema.$ref)
        : requestBody.schema,
    );

    inputSchema.properties["requestBody"] = {
      description: operation.requestBody?.description,
      ...bodySchema,
    };
    inputSchema.required.push("requestBody");
  }

  if (operation.parameters) {
    for (const parameter of operation.parameters) {
      const resolvedParameter =
        "$ref" in parameter ? resolveRef<Parameter>(spec, parameter.$ref) : parameter;

      inputSchema.properties[resolvedParameter.name] = structuredClone(resolvedParameter.schema);
      if (resolvedParameter.required) {
        inputSchema.required.push(resolvedParameter.name);
      }
    }
  }
}

function addDefinitionsToInputSchema(inputSchema: InputJsonSchema, spec: OpenApiSpec) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const definitions: Record<string, any> = {};

  function collectDefinitions(obj: unknown) {
    if (obj === null || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        collectDefinitions(item);
      }
    }

    if ("$ref" in obj && typeof obj.$ref === "string" && !obj.$ref.startsWith("#/$defs")) {
      const definition = resolveRef(spec, obj.$ref);
      const definitionName = obj.$ref.split("/").at(-1)!;
      obj.$ref = `#/$defs/${definitionName}`;

      if (definitionName in definitions) {
        return;
      }

      const clonedDefinition = structuredClone(definition);
      definitions[definitionName] = clonedDefinition;
      collectDefinitions(clonedDefinition);
      return;
    }

    for (const value of Object.values(obj)) {
      collectDefinitions(value);
    }
  }

  collectDefinitions(inputSchema);
  inputSchema.$defs = definitions;
}

function resolveRef<Value extends SecurityScheme | SomeJSONSchema | Parameter>(
  spec: OpenApiSpec,
  ref: string,
): Value {
  const parts = ref.split("/").slice(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = spec;
  for (const part of parts) {
    current = current[part];
  }

  return current;
}
