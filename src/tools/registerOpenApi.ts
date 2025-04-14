import yaml from "yaml";
import fs from "node:fs/promises";
import { z, ZodType } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type DashboardApi } from "../DashboardApi.ts";

type Methods = "get" | "post" | "put" | "delete";
type Operation = {
  "x-helper"?: boolean;
  operationId: string;
  summary?: string;
  description?: string;
  parameters: Array<{ $ref: string } | Parameter>;
};

type Path = Record<Methods, Operation>;
type Parameter = {
  in: "query" | "path";
  name: string;
  description?: string;
  required?: boolean;
  schema: { type: "string" | "integer" };
};


type OpenApiSpec = {
  paths: Record<string, Path>;
  servers: Array<{ url: string, variables?: Record<string, { default: string }> }>;
};

type OpenApiToolsOptions = {
  server: McpServer;
  dashboardApi: DashboardApi;
  openApiSpec: OpenApiSpec;
  allowedOperationIds?: Set<string>;
};

export async function loadOpenApiSpec(path: string): Promise<OpenApiSpec> {
  const openApiSpecContent = await fs.readFile(path, "utf-8");
  return yaml.parse(openApiSpecContent, {});
}

function buildUrlParameters(servers: OpenApiSpec['servers']) {
  return Object.keys(servers[0].variables || {}).reduce((acc, name) => ({...acc, [name]: z.string()}), {});
}

export async function registerOpenApiTools({
  server,
  dashboardApi,
  openApiSpec,
  allowedOperationIds,
}: OpenApiToolsOptions) {


  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    for (const [method, definition] of Object.entries(methods)) {
      if (!allowedOperationIds?.has(definition.operationId)) {
        continue;
      }

      const parameters = definition.parameters.map((p) =>
        "$ref" in p ? expandRef(p["$ref"], openApiSpec) : p
      );

      server.tool(
        definition.operationId,
        definition.summary || definition.description || "",
        {...buildParametersZodSchema(parameters), ...buildUrlParameters(openApiSpec.servers)},
        buildToolCallback({
          path,
          serverBaseUrl: openApiSpec.servers[0].url,
          method: method as Methods,
          parameters,
          dashboardApi,
        }) as any // Just trust me bro
      );
    }
  }
}

type ToolCallbackBuildOptions = {
  path: string;
  serverBaseUrl: string;
  method: Methods;
  parameters: Parameter[];
  dashboardApi: DashboardApi;
};


function buildToolCallback({
  path,
  serverBaseUrl,
  method,
  parameters,
  dashboardApi,
}: ToolCallbackBuildOptions) {
  return async (callbackParams: {
    applicationId: string;
    [key: string]: any;
  }) => {
    const { applicationId } = callbackParams;
    const apiKey = await dashboardApi.getApiKey(applicationId);

    serverBaseUrl = serverBaseUrl.replace(/{([^}]+)}/g, (_, key) => callbackParams[key]);
    const url = new URL(serverBaseUrl);
    url.pathname = path.replace(/{([^}]+)}/g, (_, key) => callbackParams[key]);

    for (const parameter of parameters) {
      if (parameter.in !== "query") continue;
      // TODO: throw error if param is required and not in callbackParams
      if (!(parameter.name in callbackParams)) continue;
      url.searchParams.set(parameter.name, callbackParams[parameter.name]);
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        "X-Algolia-API-Key": apiKey,
        "X-Algolia-Application-Id": applicationId,
      },
    });

    // TODO: handle body

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

function buildParametersZodSchema(parameters: Parameter[]) {
  // TODO: this is specific to search, other open api spec might have different default parameters
  const parametersSchema: Record<string, ZodType> = {
    applicationId: z.string(),
  };

  for (let parameter of parameters) {
    let param: ZodType;

    switch (parameter.schema.type) {
      case "string":
        param = z.string();
        break;
      case "integer":
        param = z.number().int();
        break;
      // TODO: handle more sophisticated types
      default:
        param = z.any();
        break;
    }

    if (!parameter.required) {
      param = param.optional();
    }
    if (parameter.description) {
      param = param.describe(parameter.description);
    }

    parametersSchema[parameter.name] = param;
  }

  // TODO: handle body when applicable

  return parametersSchema;
}

function expandRef(ref: string, target: any): Parameter {
  const parts = ref.split("/").slice(1);
  let value = target;

  while (parts.length) {
    const part = parts.shift()!;
    value = value[part];
  }

  return value;
}
