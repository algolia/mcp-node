import { z } from "zod";
import { CliFilteringOptionsSchema } from "../toolFilters.ts";

export const StartServerOptionsSchema = CliFilteringOptionsSchema.extend({
  credentials: z
    .object({
      applicationId: z.string(),
      apiKey: z.string(),
    })
    .optional(),
});

export type StartServerOptions = z.infer<typeof StartServerOptionsSchema>;
