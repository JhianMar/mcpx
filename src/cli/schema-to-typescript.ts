type JSONSchema = {
  type?: "string" | "number" | "boolean" | "null" | "object" | "array";
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  description?: string;
  $ref?: string;
};

type SchemaToTypeScriptOptions = {
  typeName: string;
  exportType?: boolean;
  indent?: string;
  includeDescriptions?: boolean;
};

/**
 * Convert JSON Schema to TypeScript type definition
 * @throws Error if schema contains unsupported features like $ref
 */
export function schemaToTypeScript(schema: JSONSchema, options: SchemaToTypeScriptOptions): string {
  const exportKeyword = options.exportType !== false ? "export " : "";
  const indent = options.indent ?? "  ";
  const includeDescriptions = options.includeDescriptions ?? false;

  // Check for unsupported $ref
  if (schema.$ref) {
    throw new Error("$ref is not supported");
  }

  // Generate the type definition
  const typeDef = convertSchema(schema, 0, indent, includeDescriptions);

  // Add JSDoc for top-level description if enabled
  if (includeDescriptions && schema.description) {
    const jsdoc = formatJSDoc(schema.description, 0, indent);
    return `${jsdoc}\n${exportKeyword}type ${options.typeName} = ${typeDef}`;
  }

  return `${exportKeyword}type ${options.typeName} = ${typeDef}`;
}

function convertSchema(
  schema: JSONSchema,
  depth: number,
  indent: string,
  includeDescriptions: boolean,
): string {
  // Check for $ref
  if (schema.$ref) {
    throw new Error("$ref is not supported");
  }

  // Priority order: const > enum > oneOf/anyOf > allOf > type > unknown

  // Handle const
  if ("const" in schema) {
    return formatLiteral(schema.const);
  }

  // Handle enum
  if (schema.enum) {
    return schema.enum.map(formatLiteral).join(" | ");
  }

  // Handle oneOf/anyOf (union types)
  if (schema.oneOf || schema.anyOf) {
    const schemas = schema.oneOf ?? schema.anyOf ?? [];
    return schemas
      .map((s) => {
        const converted = convertSchema(s, depth, indent, includeDescriptions);
        // If it's a multi-line object, we need to format it properly
        if (converted.includes("\n")) {
          return converted;
        }
        return converted;
      })
      .join(" | ");
  }

  // Handle allOf (intersection/merge)
  if (schema.allOf && schema.allOf.length > 0) {
    if (schema.allOf.length === 1) {
      // Single schema - just unwrap it
      const firstSchema = schema.allOf[0];
      if (!firstSchema) {
        return "unknown";
      }
      return convertSchema(firstSchema, depth, indent, includeDescriptions);
    }

    // Multiple schemas - merge properties
    const merged: JSONSchema = {
      type: "object",
      properties: {},
      required: [],
    };

    for (const subSchema of schema.allOf) {
      if (subSchema.properties) {
        merged.properties = { ...merged.properties, ...subSchema.properties };
      }
      if (subSchema.required) {
        merged.required = [...(merged.required || []), ...subSchema.required];
      }
    }

    return convertSchema(merged, depth, indent, includeDescriptions);
  }

  // Handle typed schemas
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return formatArray(schema, depth, indent, includeDescriptions);
    case "object":
      return formatObject(schema, depth, indent, includeDescriptions);
    default:
      return "unknown";
  }
}

function formatArray(
  schema: JSONSchema,
  depth: number,
  indent: string,
  includeDescriptions: boolean,
): string {
  if (!schema.items) {
    return "unknown[]";
  }

  const itemType = convertSchema(schema.items, depth, indent, includeDescriptions);

  // If item type is complex (contains newline), use Array<...> syntax
  if (itemType.includes("\n")) {
    return `Array<${itemType}>`;
  }

  // For simple types, use type[] syntax
  return `${itemType}[]`;
}

function formatObject(
  schema: JSONSchema,
  depth: number,
  indent: string,
  includeDescriptions: boolean,
): string {
  const props = schema.properties;

  // Empty object or no properties
  if (!props || Object.keys(props).length === 0) {
    return "Record<string, unknown>";
  }

  const required = new Set(schema.required || []);
  const lines: string[] = [];

  for (const [key, propSchema] of Object.entries(props)) {
    const isRequired = required.has(key);
    const quotedKey = needsQuotes(key) ? `'${key}'` : key;
    const optional = isRequired ? "" : "?";
    const propType = convertSchema(propSchema, depth + 1, indent, includeDescriptions);

    // Add description comment if enabled
    if (includeDescriptions && propSchema.description) {
      lines.push(`${indent.repeat(depth + 1)}/** ${propSchema.description} */`);
    }

    lines.push(`${indent.repeat(depth + 1)}${quotedKey}${optional}: ${propType}`);
  }

  return `{\n${lines.join("\n")}\n${indent.repeat(depth)}}`;
}

function needsQuotes(key: string): boolean {
  // Valid JavaScript identifier: starts with letter or underscore,
  // followed by letters, digits, or underscores
  return !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key);
}

function formatLiteral(value: unknown): string {
  if (typeof value === "string") {
    return `'${value}'`;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // For objects/arrays, use JSON stringification
  return JSON.stringify(value);
}

function formatJSDoc(description: string, depth: number, indent: string): string {
  const indentation = indent.repeat(depth);
  return `${indentation}/**\n${indentation} * ${description}\n${indentation} */`;
}
