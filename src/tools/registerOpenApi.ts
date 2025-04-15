import yaml from "yaml";
import fs from "node:fs/promises";
import {z, type ZodType} from "zod";
import {type McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {type DashboardApi} from "../DashboardApi.ts";
import {expandAllRefs, jsonSchemaToZod, type JsonSchema} from "../helpers.ts";

type Methods = "get" | "post" | "put" | "delete";
type Operation = {
    "x-helper"?: boolean;
    operationId: string;
    summary?: string;
    description?: string;
    parameters: Array<Parameter>;
    requestBody?: RequestBody;
};

type Path = Record<Methods, Operation>;

type Parameter = {
    in: "query" | "path";
    name: string;
    description?: string;
    required?: boolean;
    schema: JsonSchema;
};

type RequestBody = {
    required?: boolean;
    description?: string;
    content: Record<string, RequestBodyContent>;
};

type RequestBodyContent = {
    schema: JsonSchema;
};

type OpenApiSpec = {
    paths: Record<string, Path>;
    servers: Array<{
        url: string;
        variables?: Record<string, { default: string }>;
    }>;
};

type OpenApiToolsOptions = {
    server: McpServer;
    dashboardApi: DashboardApi;
    openApiSpec: OpenApiSpec;
    allowedOperationIds?: Set<string>;
    debug?: boolean;
    getRegion?: (logRegion?: string) => string;
};

export async function loadOpenApiSpec(path: string): Promise<OpenApiSpec> {
    const openApiSpecContent = await fs.readFile(path, "utf-8");
    const spec = yaml.parse(openApiSpecContent, {});
    return expandAllRefs(spec) as OpenApiSpec;
}

function buildUrlParameters(servers: OpenApiSpec["servers"]) {
    return Object.keys(servers[0].variables || {}).reduce(
        (acc, name) => ({...acc, [name]: z.string()}),
        {}
    );
}

export async function registerOpenApiTools({
                                               server,
                                               dashboardApi,
                                               openApiSpec,
                                               allowedOperationIds,
                                               getRegion
                                           }: OpenApiToolsOptions) {


    for (const [path, methods] of Object.entries(openApiSpec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
            if (!allowedOperationIds?.has(operation.operationId)) {
                continue;
            }

            server.tool(
                operation.operationId,
                operation.summary || operation.description || "",
                {
                    ...buildParametersZodSchema(operation),
                    ...(getRegion ? {} : buildUrlParameters(openApiSpec.servers)),
                },
                buildToolCallback({
                    path,
                    serverBaseUrl: openApiSpec.servers[0].url,
                    method: method as Methods,
                    parameters: operation.parameters,
                    dashboardApi,
                    getRegion
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
    getRegion?: (logRegion?: string) => string;
};

function buildToolCallback({
                               path,
                               serverBaseUrl,
                               method,
                               parameters,
                               dashboardApi,
                               getRegion
                           }: ToolCallbackBuildOptions) {
    return async (callbackParams: {
        applicationId: string;
        [key: string]: any;
    }) => {
        const {applicationId, requestBody} = callbackParams;
        const apiKey = await dashboardApi.getApiKey(applicationId);

       if (getRegion) {
           const logRegion = dashboardApi.applicationList?.data.find(
               (application) => application.id === applicationId
           )?.attributes.log_region;
            let newRegion = getRegion(logRegion);
            if (newRegion) {
                callbackParams.region = newRegion;
            }

            console.error("Regions for AppID (LogRegion, Ingestion region)", logRegion, newRegion);
        }

        console.error("Callback params", callbackParams);


       console.error("Server base URL", serverBaseUrl);

        serverBaseUrl = serverBaseUrl.replace(
            /{([^}]+)}/g,
            (_, key) => callbackParams[key]
        );
        const url = new URL(serverBaseUrl);
        url.pathname = path.replace(/{([^}]+)}/g, (_, key) => callbackParams[key]);

        for (const parameter of parameters) {
            if (parameter.in !== "query") continue;
            // TODO: throw error if param is required and not in callbackParams
            if (!(parameter.name in callbackParams)) continue;
            url.searchParams.set(parameter.name, callbackParams[parameter.name]);
        }

        if (method === "get" && requestBody) {
            throw new Error("requestBody is not supported for GET requests");
        }

        const body = requestBody
            ? // Claude likes to send me JSON already serialized as a string...
            isJsonString(requestBody)
                ? requestBody
                : JSON.stringify(requestBody)
            : undefined;

        let headers = {
            "X-Algolia-API-Key": apiKey,
            "X-Algolia-Application-Id": applicationId,
        };
        console.error("will call ", url.toString(), {
            method,
            body,
            headers
        });

        const response = await fetch(url.toString(), {
            method,
            headers: headers,
            body,
        });

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
    }

    return false;
}

function buildParametersZodSchema(operation: Operation) {
    // TODO: this is specific to search, other open api spec might have different default parameters
    const parametersSchema: Record<string, ZodType> = {
        applicationId: z.string(),
    };

    if (!operation.parameters) {
        return parametersSchema;
    }

    for (let parameter of operation.parameters) {
        parametersSchema[parameter.name] = jsonSchemaToZod(parameter.schema);
    }

    const requestBody = operation.requestBody?.content["application/json"];
    if (requestBody) {
        let requestBodySchema = jsonSchemaToZod(requestBody.schema);

        if (operation.requestBody?.description && !requestBodySchema.description) {
            requestBodySchema = requestBodySchema.describe(
                operation.requestBody.description
            );
        }
        parametersSchema["requestBody"] = requestBodySchema;
    }

    return parametersSchema;
}
