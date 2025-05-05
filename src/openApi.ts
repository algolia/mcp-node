import SearchSpecJson from "./data/search.json" with { type: "json" };
import AnalyticsSpecJson from "./data/analytics.json" with { type: "json" };
import RecommendSpecJson from "./data/recommend.json" with { type: "json" };
import ABTestingSpecJson from "./data/abtesting.json" with { type: "json" };
import MonitoringSpecJson from "./data/monitoring.json" with { type: "json" };
import IngestionSpecJson from "./data/ingestion.json" with { type: "json" };
import UsageSpecJson from "./data/usage-api-v2.json" with { type: "json" };
import CollectionsSpecJson from "./data/collections.json" with { type: "json" };
import QuerySuggestionsSpecJson from "./data/query-suggestions.json" with { type: "json" };
import type { SomeJSONSchema } from "ajv/dist/types/json-schema.js";

// import { type JsonSchema } from "./helpers.ts";

export type Methods = "get" | "post" | "put" | "delete";

export type Operation = {
  "x-helper"?: boolean;
  "x-use-read-transporter"?: boolean;
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Array<Parameter | Ref>;
  requestBody?: RequestBody;
  security?: Array<SecurityItem>;
};

type Ref = {
  $ref: string;
};

type Path = Record<Methods, Operation>;

export type Parameter = {
  in: "query" | "path";
  name: string;
  description?: string;
  required?: boolean;
  schema: SomeJSONSchema;
};

type RequestBody = {
  required?: boolean;
  description?: string;
  content: Record<string, RequestBodyContent>;
};

type RequestBodyContent = {
  schema: SomeJSONSchema;
};

export type SecurityItem = Record<string, Array<string>>;

export type SecurityScheme = {
  type: string;
  in: "header" | "query";
  name: string;
  description?: string;
  required?: boolean;
};

type UrlVariable = {
  default?: string;
  description?: string;
};

export type OpenApiSpec = {
  info: {
    title: string;
    description: string;
  };
  paths: Record<string, Path>;
  servers: Array<{
    url: string;
    variables?: Record<string, UrlVariable>;
  }>;
  security?: Array<SecurityItem>;
  components?: {
    schemas?: Record<string, SomeJSONSchema>;
    parameters?: Record<string, Parameter>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
};

export const SearchSpec = SearchSpecJson as unknown as OpenApiSpec;
export const AnalyticsSpec = AnalyticsSpecJson as unknown as OpenApiSpec;
export const RecommendSpec = RecommendSpecJson as unknown as OpenApiSpec;
export const ABTestingSpec = ABTestingSpecJson as unknown as OpenApiSpec;
export const MonitoringSpec = MonitoringSpecJson as unknown as OpenApiSpec;
export const IngestionSpec = IngestionSpecJson as unknown as OpenApiSpec;
export const UsageSpec = UsageSpecJson as unknown as OpenApiSpec;
export const CollectionsSpec = CollectionsSpecJson as unknown as OpenApiSpec;
export const QuerySuggestionsSpec = QuerySuggestionsSpecJson as unknown as OpenApiSpec;

export const ALL_SPECS = [
  SearchSpec,
  AnalyticsSpec,
  RecommendSpec,
  ABTestingSpec,
  MonitoringSpec,
  IngestionSpec,
  UsageSpec,
  CollectionsSpec,
  QuerySuggestionsSpec,
];
