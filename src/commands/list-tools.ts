import { operationId as GetUserInfoOperationId } from "../tools/registerGetUserInfo.ts";
import { operationId as GetApplicationsOperationId } from "../tools/registerGetApplications.ts";
import { ALL_SPECS, type OpenApiSpec } from "../openApi.ts";
import type { ToolFilter } from "../toolFilters.ts";
import { type CliFilteringOptions, getToolFilter, isToolAllowed } from "../toolFilters.ts";

export function getToolIds(toolFilter?: ToolFilter): string[] {
  const results = [];
  for (const spec of ALL_SPECS) {
    const toolIds = extractToolIds(spec).filter((id) => isToolAllowed(id, toolFilter));
    results.push(...toolIds);
  }
  return results;
}

export type ListToolsOptions = CliFilteringOptions & {
  all: boolean;
};

export async function listTools(opts: ListToolsOptions): Promise<void> {
  const toolFilter = opts.all ? undefined : getToolFilter(opts);

  const dashboardApiTools = [GetUserInfoOperationId, GetApplicationsOperationId].filter((id) =>
    isToolAllowed(id, toolFilter),
  );
  if (dashboardApiTools.length > 0) {
    displayGroup("Dashboard API", dashboardApiTools);
  }

  for (const spec of ALL_SPECS) {
    const toolIds = extractToolIds(spec).filter((id) => isToolAllowed(id, toolFilter));

    if (toolIds.length > 0) {
      displayGroup(spec.info.title, toolIds);
    }
  }
}

function displayGroup(title: string, operationIds: string[]): void {
  console.log(title);
  console.log(`> ${operationIds.join(", ")}\n`);
}

function extractToolIds(spec: OpenApiSpec): string[] {
  return Object.values(spec.paths)
    .flatMap((path) => Object.values(path))
    .filter((operation) => !operation["x-helper"])
    .map((operation) => operation.operationId);
}
