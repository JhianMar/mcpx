import { describe, expect, test } from "vitest";
import { schemaToTypeScript } from "../src/cli/schema-to-typescript.js";

// Helper to convert test schemas to proper JSONSchema type
function testSchema(schema: unknown) {
  return schema as Parameters<typeof schemaToTypeScript>[0];
}

describe("schemaToTypeScript", () => {
  describe("primitive types", () => {
    test("string type", () => {
      const schema = { type: "string" };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Name",
      });
      expect(result).toBe("export type Name = string");
    });

    test("number type", () => {
      const schema = { type: "number" };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Age",
      });
      expect(result).toBe("export type Age = number");
    });

    test("boolean type", () => {
      const schema = { type: "boolean" };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "IsActive",
      });
      expect(result).toBe("export type IsActive = boolean");
    });

    test("null type", () => {
      const schema = { type: "null" };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Empty",
      });
      expect(result).toBe("export type Empty = null");
    });

    test("any type (no type specified)", () => {
      const schema = {};
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Any",
      });
      expect(result).toBe("export type Any = unknown");
    });
  });

  describe("object types", () => {
    test("simple object with required fields", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "age"],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Person",
      });
      expect(result).toBe(`export type Person = {
  name: string
  age: number
}`);
    });

    test("object with optional fields", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
        },
        required: ["name"],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "User",
      });
      expect(result).toBe(`export type User = {
  name: string
  email?: string
}`);
    });

    test("object with all optional fields", () => {
      const schema = {
        type: "object",
        properties: {
          title: { type: "string" },
          count: { type: "number" },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Options",
      });
      expect(result).toBe(`export type Options = {
  title?: string
  count?: number
}`);
    });

    test("empty object", () => {
      const schema = {
        type: "object",
        properties: {},
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Empty",
      });
      expect(result).toBe("export type Empty = Record<string, unknown>");
    });

    test("object with no properties defined", () => {
      const schema = {
        type: "object",
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "AnyObject",
      });
      expect(result).toBe("export type AnyObject = Record<string, unknown>");
    });
  });

  describe("nested objects", () => {
    test("object with nested object", () => {
      const schema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
            },
            required: ["name"],
          },
        },
        required: ["user"],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Data",
      });
      expect(result).toBe(`export type Data = {
  user: {
    name: string
    age?: number
  }
}`);
    });

    test("deeply nested objects (3 levels)", () => {
      const schema = {
        type: "object",
        properties: {
          company: {
            type: "object",
            properties: {
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                },
                required: ["city"],
              },
            },
            required: ["address"],
          },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "CompanyData",
      });
      expect(result).toBe(`export type CompanyData = {
  company?: {
    address: {
      street?: string
      city: string
    }
  }
}`);
    });

    test("multiple nested objects at same level", () => {
      const schema = {
        type: "object",
        properties: {
          author: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
          },
          metadata: {
            type: "object",
            properties: {
              created: { type: "string" },
            },
          },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Document",
      });
      expect(result).toBe(`export type Document = {
  author?: {
    name?: string
  }
  metadata?: {
    created?: string
  }
}`);
    });
  });

  describe("array types", () => {
    test("array of primitives", () => {
      const schema = {
        type: "array",
        items: { type: "string" },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Names",
      });
      expect(result).toBe("export type Names = string[]");
    });

    test("array of objects", () => {
      const schema = {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number" },
            name: { type: "string" },
          },
          required: ["id"],
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Users",
      });
      expect(result).toBe(`export type Users = Array<{
  id: number
  name?: string
}>`);
    });

    test("array without items schema", () => {
      const schema = {
        type: "array",
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "List",
      });
      expect(result).toBe("export type List = unknown[]");
    });

    test("object with array property", () => {
      const schema = {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Post",
      });
      expect(result).toBe(`export type Post = {
  tags?: string[]
}`);
    });

    test("nested array of arrays", () => {
      const schema = {
        type: "array",
        items: {
          type: "array",
          items: { type: "number" },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Matrix",
      });
      expect(result).toBe("export type Matrix = number[][]");
    });
  });

  describe("enum types", () => {
    test("string enum", () => {
      const schema = {
        type: "string",
        enum: ["active", "inactive", "pending"],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Status",
      });
      expect(result).toBe(`export type Status = 'active' | 'inactive' | 'pending'`);
    });

    test("number enum", () => {
      const schema = {
        type: "number",
        enum: [1, 2, 3],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Priority",
      });
      expect(result).toBe("export type Priority = 1 | 2 | 3");
    });

    test("mixed enum types", () => {
      const schema = {
        enum: ["active", 1, true, null],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Mixed",
      });
      expect(result).toBe(`export type Mixed = 'active' | 1 | true | null`);
    });
  });

  describe("union types (oneOf/anyOf)", () => {
    test("oneOf with primitives", () => {
      const schema = {
        oneOf: [{ type: "string" }, { type: "number" }],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "StringOrNumber",
      });
      expect(result).toBe("export type StringOrNumber = string | number");
    });

    test("anyOf with objects", () => {
      const schema = {
        anyOf: [
          {
            type: "object",
            properties: {
              type: { const: "a" },
              value: { type: "string" },
            },
            required: ["type", "value"],
          },
          {
            type: "object",
            properties: {
              type: { const: "b" },
              count: { type: "number" },
            },
            required: ["type", "count"],
          },
        ],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Union",
      });
      expect(result).toBe(`export type Union = {
  type: 'a'
  value: string
} | {
  type: 'b'
  count: number
}`);
    });

    test("oneOf with nested objects", () => {
      const schema = {
        oneOf: [
          {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
          { type: "null" },
        ],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "OptionalUser",
      });
      expect(result).toBe(`export type OptionalUser = {
  user?: {
    name?: string
  }
} | null`);
    });
  });

  describe("const types", () => {
    test("string const", () => {
      const schema = {
        const: "specific-value",
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Constant",
      });
      expect(result).toBe(`export type Constant = 'specific-value'`);
    });

    test("number const", () => {
      const schema = {
        const: 42,
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Answer",
      });
      expect(result).toBe("export type Answer = 42");
    });

    test("boolean const", () => {
      const schema = {
        const: true,
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "AlwaysTrue",
      });
      expect(result).toBe("export type AlwaysTrue = true");
    });
  });

  describe("descriptions and JSDoc", () => {
    test("type with description", () => {
      const schema = {
        type: "string",
        description: "The user name",
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Name",
        includeDescriptions: true,
      });
      expect(result).toBe(`/**
 * The user name
 */
export type Name = string`);
    });

    test("object properties with descriptions", () => {
      const schema = {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "User full name",
          },
          age: {
            type: "number",
            description: "User age in years",
          },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "User",
        includeDescriptions: true,
      });
      expect(result).toBe(`export type User = {
  /** User full name */
  name?: string
  /** User age in years */
  age?: number
}`);
    });

    test("descriptions disabled by default", () => {
      const schema = {
        type: "string",
        description: "Should not appear",
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Name",
      });
      expect(result).toBe("export type Name = string");
    });
  });

  describe("edge cases", () => {
    test("schema with $ref should throw error", () => {
      const schema = {
        $ref: "#/definitions/User",
      };
      expect(() => schemaToTypeScript(testSchema(schema), { typeName: "Test" })).toThrow(
        "$ref is not supported",
      );
    });

    test("property names with special characters", () => {
      const schema = {
        type: "object",
        properties: {
          "user-name": { type: "string" },
          user_id: { type: "number" },
          "@meta": { type: "boolean" },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Data",
      });
      expect(result).toBe(`export type Data = {
  'user-name'?: string
  user_id?: number
  '@meta'?: boolean
}`);
    });

    test("no export option", () => {
      const schema = { type: "string" };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "Name",
        exportType: false,
      });
      expect(result).toBe("type Name = string");
    });

    test("custom indentation", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "User",
        indent: "    ",
      });
      expect(result).toBe(`export type User = {
    name?: string
}`);
    });

    test("allOf with single schema", () => {
      const schema = {
        allOf: [
          {
            type: "object",
            properties: {
              name: { type: "string" },
            },
          },
        ],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "User",
      });
      expect(result).toBe(`export type User = {
  name?: string
}`);
    });

    test("allOf with multiple schemas (intersection)", () => {
      const schema = {
        allOf: [
          {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
          },
          {
            type: "object",
            properties: {
              age: { type: "number" },
            },
          },
        ],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "User",
      });
      expect(result).toBe(`export type User = {
  name: string
  age?: number
}`);
    });
  });

  describe("real-world MCP tool schemas", () => {
    test("simple MCP tool input schema", () => {
      const schema = {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to read",
          },
          encoding: {
            type: "string",
            enum: ["utf-8", "ascii", "base64"],
          },
        },
        required: ["path"],
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "ReadFileInput",
        includeDescriptions: true,
      });
      expect(result).toBe(`export type ReadFileInput = {
  /** File path to read */
  path: string
  encoding?: 'utf-8' | 'ascii' | 'base64'
}`);
    });

    test("complex nested MCP schema", () => {
      const schema = {
        type: "object",
        properties: {
          filters: {
            type: "object",
            properties: {
              property: {
                type: "string",
              },
              checkbox: {
                type: "object",
                properties: {
                  equals: { type: "boolean" },
                  does_not_equal: { type: "boolean" },
                },
              },
            },
          },
          sorts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                property: { type: "string" },
                direction: {
                  type: "string",
                  enum: ["ascending", "descending"],
                },
              },
              required: ["property"],
            },
          },
        },
      };
      const result = schemaToTypeScript(testSchema(schema), {
        typeName: "QueryDatabase",
      });
      expect(result).toBe(`export type QueryDatabase = {
  filters?: {
    property?: string
    checkbox?: {
      equals?: boolean
      does_not_equal?: boolean
    }
  }
  sorts?: Array<{
    property: string
    direction?: 'ascending' | 'descending'
  }>
}`);
    });
  });
});
