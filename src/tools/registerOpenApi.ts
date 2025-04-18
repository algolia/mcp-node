/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ZodRawShape } from "zod";
import { z, type ZodType } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonSchemaToZod } from "../helpers.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import type { Methods, OpenApiSpec, Operation, SecurityScheme } from "../openApi.ts";
import { CONFIG } from "../config.ts";

export type RequestMiddleware = (opts: {
  request: Request;

  params: Record<string, any>;
}) => Promise<Request>;

export type ProcessParameters = (parameters: ZodRawShape) => Promise<ZodRawShape>;
export type ProcessCallbackParameters = (
  params: Record<string, any>,
  securityKeys: Set<string>,
) => Promise<object>;

type OpenApiToolsOptions = {
  server: Pick<McpServer, "tool">;
  openApiSpec: OpenApiSpec;
  toolFilter?: ToolFilter;
  processParameters?: ProcessParameters;
  processCallbackParameters?: ProcessCallbackParameters;
  requestMiddlewares?: Array<RequestMiddleware>;
};

function buildUrlParameters(servers: OpenApiSpec["servers"]): Record<string, ZodType> {
  const vars = servers[0].variables || {};

  return Object.entries(vars).reduce<Record<string, ZodType>>((acc, [name, urlVariable]) => {
    let schema = z.string();
    if (urlVariable.description) schema = schema.describe(urlVariable.description);

    acc[name] = schema;

    return acc;
  }, {});
}

function buildSecurityParameters(
  keys: Set<string>,
  securitySchemes: Record<string, SecurityScheme>,
): Record<string, ZodType> {
  const result: Record<string, ZodType> = {};

  for (const key of keys) {
    if (key === "apiKey") continue;

    let schema = z.string();

    if (securitySchemes[key].description) {
      schema = schema.describe(securitySchemes[key].description);
    }

    result[key] = schema;
  }

  return result;
}

const identity = async <T>(x: T) => x;

export async function registerOpenApiTools({
  server,
  openApiSpec,
  toolFilter,
  requestMiddlewares,
  processParameters = identity,
  processCallbackParameters = identity,
}: OpenApiToolsOptions) {
  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!isToolAllowed(operation.operationId, toolFilter)) continue;

      const securityKeys = new Set(
        [...(openApiSpec.security ?? []), ...(operation.security ?? [])].flatMap((item) =>
          Object.keys(item),
        ),
      );
      const securitySchemes = openApiSpec.components?.securitySchemes ?? {};

      const parameters = await processParameters({
        ...buildSecurityParameters(securityKeys, securitySchemes),
        ...buildUrlParameters(openApiSpec.servers),
        ...buildParametersZodSchema(operation),
      });

      const toolCallback = buildToolCallback({
        path,
        serverBaseUrl: openApiSpec.servers[0].url,
        method: method as Methods,
        operation,
        processCallbackParameters,
        requestMiddlewares,
        securityKeys,
        securitySchemes: openApiSpec.components?.securitySchemes ?? {},
      });

      server.tool(
        operation.operationId,
        operation.summary || operation.description || "",
        parameters,
        // @ts-expect-error - the types are hard to satisfy when building tools dynamically. Just trust me bro.
        toolCallback,
      );
    }
  }
}

type ToolCallbackBuildOptions = {
  path: string;
  serverBaseUrl: string;
  method: Methods;
  operation: Operation;
  securityKeys: Set<string>;
  securitySchemes: Record<string, SecurityScheme>;
  processCallbackParameters: ProcessCallbackParameters;
  requestMiddlewares?: Array<RequestMiddleware>;
};

function buildToolCallback({
  path,
  serverBaseUrl,
  method,
  operation,
  securityKeys,
  securitySchemes,
  requestMiddlewares,
  processCallbackParameters,
}: ToolCallbackBuildOptions) {
  return async (rawParams: any) => {
    const params: Record<string, any> = await processCallbackParameters(
      rawParams ?? {},
      securityKeys,
    );
    const { requestBody } = params;

    if (method === "get" && requestBody) {
      throw new Error("requestBody is not supported for GET requests");
    }

    const preparedUrl = serverBaseUrl.replace(/{([^}]+)}/g, (_, key) => params[key]);
    const url = new URL(preparedUrl);
    url.pathname = path.replace(/{([^}]+)}/g, (_, key) => params[key]);

    if (operation.parameters) {
      for (const parameter of operation.parameters) {
        if (parameter.in !== "query") continue;
        // TODO: throw error if param is required and not in callbackParams
        if (!(parameter.name in params)) continue;
        url.searchParams.set(parameter.name, params[parameter.name]);
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
    const data = await response.json();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data),
        },
      ],
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

function buildParametersZodSchema(operation: Operation) {
  const parametersSchema: Record<string, ZodType> = {};

  if (operation.parameters) {
    for (const parameter of operation.parameters) {
      parametersSchema[parameter.name] = jsonSchemaToZod(parameter.schema);
    }
  }

  const requestBody = operation.requestBody?.content["application/json"];
  if (requestBody) {
    let requestBodySchema = jsonSchemaToZod(requestBody.schema);

    if (operation.requestBody?.description && !requestBodySchema.description) {
      requestBodySchema = requestBodySchema.describe(operation.requestBody.description);
    }
    parametersSchema["requestBody"] = requestBodySchema;
  }

  return parametersSchema;
}
