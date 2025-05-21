import z from "zod";

export const CliFilteringOptionsSchema = z.object({
  allowTools: z.array(z.string()).optional(),
  denyTools: z.array(z.string()).optional(),
});
export type CliFilteringOptions = z.infer<typeof CliFilteringOptionsSchema>;

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
