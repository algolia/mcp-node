import { z, type AnyZodObject, type ZodType } from "zod";

type JsonSchemaShared = {
  title?: string;
  description?: string;
};

type JsonSchemaArray = {
  type: "array";
  items: JsonSchema;
};

type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
};

type JsonSchemaOneOf = {
  oneOf: JsonSchema[];
};

type JsonSchemaString = {
  type: "string";
  enum?: string[];
};

type JsonSchemaPrimitive = {
  type: "number" | "integer" | "boolean";
};

export type JsonSchema =
  | JsonSchemaOneOf
  | (JsonSchemaShared &
      (JsonSchemaArray | JsonSchemaString | JsonSchemaObject | JsonSchemaPrimitive));

export function jsonSchemaToZod(jsonSchema: JsonSchema): ZodType {
  if ("oneOf" in jsonSchema) {
    return z.union(
      // @ts-expect-error - zod does not like us building a union type dynamically
      jsonSchema.oneOf.map((s) => jsonSchemaToZod(s)),
    );
  }

  let zodSchema: ZodType;

  switch (jsonSchema.type) {
    case "string":
      zodSchema = z.string();
      break;
    case "integer":
      zodSchema = z.number().int();
      break;
    case "number":
      zodSchema = z.number();
      break;
    case "array":
      zodSchema = z.array(jsonSchemaToZod(jsonSchema.items));
      break;
    case "object": {
      const { properties, required, additionalProperties } = jsonSchema;

      let objectSchema: AnyZodObject = z.object(
        Object.fromEntries(
          Object.entries(properties ?? {}).map(([key, value]) => {
            let item = jsonSchemaToZod(value);
            if (!required?.includes(key)) {
              item = item.optional();
            }

            return [key, item];
          }),
        ),
      );

      if (!properties || additionalProperties) {
        objectSchema = objectSchema.passthrough();
      }

      zodSchema = objectSchema;
      break;
    }
    case "boolean":
      zodSchema = z.boolean();
      break;
    default:
      zodSchema = z.any();
      break;
  }
  if (jsonSchema.description) {
    zodSchema = zodSchema.describe(jsonSchema.description);
  } else if (jsonSchema.title) {
    zodSchema = zodSchema.describe(jsonSchema.title);
  }

  if (jsonSchema.type === "string" && jsonSchema.enum) {
    zodSchema = zodSchema.describe(
      [zodSchema.description, `Value must be one of: ${jsonSchema.enum.join(", ")}.`]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return zodSchema;
}

export function expandAllRefs(json: object) {
  const root = structuredClone(json);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function recursivelyExpand(obj: Record<string, any>): void {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item !== "object" || value === null) continue;

          if ("$ref" in item) {
            value[i] = valueAtPath(item.$ref, root);
          } else {
            recursivelyExpand(item);
          }
        }
        continue;
      }

      if (typeof value === "object" && value !== null) {
        if ("$ref" in value) {
          obj[key] = valueAtPath(value.$ref, root);
        } else {
          recursivelyExpand(value);
        }
      }
    }
  }

  recursivelyExpand(root);

  return root;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function valueAtPath(path: string, target: Record<string, any>): any {
  const parts = path.split("/").slice(1);
  let value = target;

  while (parts.length) {
    const part = parts.shift()!;
    value = value[part];
  }

  return value;
}
