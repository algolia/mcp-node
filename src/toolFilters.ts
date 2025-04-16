export type CliFilteringOptions = {
  allowTools?: string[];
  denyTools?: string[];
};

export type ToolFilter = {
  allowedTools?: Set<string>;
  deniedTools?: Set<string>;
};

const INTERNAL_DENIED_TOOLS = new Set(["customGet", "customPost", "customPut", "customDelete"]);

export const getToolFilter = (opts: CliFilteringOptions): ToolFilter => {
  return {
    allowedTools: opts.allowTools ? new Set(opts.allowTools) : undefined,
    deniedTools: opts.denyTools ? new Set(opts.denyTools) : undefined,
  };
};

export function isToolAllowed(toolId: string, filter: ToolFilter = {}): boolean {
  if (INTERNAL_DENIED_TOOLS.has(toolId)) {
    return false;
  }

  if (filter.deniedTools?.has(toolId)) {
    return false;
  }

  if (!filter.allowedTools) {
    return true;
  }

  return filter.allowedTools.has(toolId);
}
