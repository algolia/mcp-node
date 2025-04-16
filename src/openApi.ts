import SearchSpecJson from "./data/search.json" with { type: "json" };
import AnalyticsSpecJson from "./data/analytics.json" with { type: "json" };
import RecommendSpecJson from "./data/recommend.json" with { type: "json" };
import ABTestingSpecJson from "./data/abtesting.json" with { type: "json" };
import MonitoringSpecJson from "./data/monitoring.json" with { type: "json" };
import IngestionSpecJson from "./data/ingestion.json" with { type: "json" };
import UsageSpecJson from "./data/usage-api-v2.json" with { type: "json" };

import { expandAllRefs, type JsonSchema } from "./helpers.ts";

export type Methods = "get" | "post" | "put" | "delete";

export type Operation = {
  "x-helper"?: boolean;
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Array<Parameter>;
  requestBody?: RequestBody;
  security?: Array<SecurityItem>;
};

type Path = Record<Methods, Operation>;

export type Parameter = {
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

export type SecurityItem = Record<string, Array<string>>;

export type SecurityScheme = {
  type: string;
  in: "header" | "query";
  name: string;
  description?: string;
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
    securitySchemes?: Record<string, SecurityScheme>;
  };
};

export const SearchSpec = expandAllRefs(SearchSpecJson) as OpenApiSpec;
export const AnalyticsSpec = expandAllRefs(AnalyticsSpecJson) as OpenApiSpec;
export const RecommendSpec = expandAllRefs(RecommendSpecJson) as OpenApiSpec;
export const ABTestingSpec = expandAllRefs(ABTestingSpecJson) as OpenApiSpec;
export const MonitoringSpec = expandAllRefs(MonitoringSpecJson) as OpenApiSpec;
export const IngestionSpec = expandAllRefs(IngestionSpecJson) as OpenApiSpec;
export const UsageSpec = expandAllRefs(UsageSpecJson) as OpenApiSpec;

export const ALL_SPECS = [
  SearchSpec,
  AnalyticsSpec,
  RecommendSpec,
  ABTestingSpec,
  MonitoringSpec,
  IngestionSpec,
  UsageSpec,
];
