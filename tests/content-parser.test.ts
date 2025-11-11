import { describe, expect, test } from "vitest";
import { tryParseContent } from "../src/cli/content-parser.js";

describe("tryParseContent", () => {
  describe("content field parsing", () => {
    test("parses JSON string in content field", () => {
      const input = {
        content: '{"key": "value", "number": 42}',
        other: "data",
      };

      const result = tryParseContent(input);

      expect(result).toEqual({
        content: { key: "value", number: 42 },
        other: "data",
      });
    });

    test("parses array JSON in content field", () => {
      const input = {
        content: "[1, 2, 3]",
      };

      const result = tryParseContent(input);

      expect(result).toEqual({
        content: [1, 2, 3],
      });
    });

    test("parses nested object JSON in content field", () => {
      const input = {
        content: '{"user": {"name": "test", "age": 25}}',
      };

      const result = tryParseContent(input);

      expect(result).toEqual({
        content: {
          user: { name: "test", age: 25 },
        },
      });
    });

    test("parses boolean JSON in content field", () => {
      const input = {
        content: "true",
      };

      const result = tryParseContent(input);

      expect(result).toEqual({
        content: true,
      });
    });

    test("parses null JSON in content field", () => {
      const input = {
        content: "null",
      };

      const result = tryParseContent(input);

      expect(result).toEqual({
        content: null,
      });
    });

    test("parses number JSON in content field", () => {
      const input = {
        content: "42",
      };

      const result = tryParseContent(input);

      expect(result).toEqual({
        content: 42,
      });
    });
  });

  describe("non-parseable content", () => {
    test("returns original value when content is not JSON", () => {
      const input = {
        content: "plain text, not JSON",
        other: "data",
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("returns original value when content is already an object", () => {
      const input = {
        content: { already: "parsed" },
        other: "data",
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("returns original value when content is already an array", () => {
      const input = {
        content: [1, 2, 3],
        other: "data",
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("returns original value when content is number", () => {
      const input = {
        content: 42,
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("returns original value when content is boolean", () => {
      const input = {
        content: true,
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("returns original value when content is null", () => {
      const input = {
        content: null,
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });
  });

  describe("no content field", () => {
    test("returns original value when no content field present", () => {
      const input = {
        other: "data",
        foo: "bar",
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("returns original value when empty object", () => {
      const input = {};

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });
  });

  describe("edge cases", () => {
    test("returns primitives as-is", () => {
      expect(tryParseContent("string")).toBe("string");
      expect(tryParseContent(42)).toBe(42);
      expect(tryParseContent(true)).toBe(true);
      expect(tryParseContent(null)).toBe(null);
      expect(tryParseContent(undefined)).toBe(undefined);
    });

    test("handles array input", () => {
      const input = [1, 2, 3];

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("preserves other fields when parsing content", () => {
      const input = {
        content: '{"parsed": true}',
        field1: "value1",
        field2: 42,
        field3: { nested: "object" },
      };

      const result = tryParseContent(input);

      expect(result).toEqual({
        content: { parsed: true },
        field1: "value1",
        field2: 42,
        field3: { nested: "object" },
      });
    });

    test("handles empty string content", () => {
      const input = {
        content: "",
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("handles whitespace-only content", () => {
      const input = {
        content: "   ",
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("handles invalid JSON gracefully", () => {
      const input = {
        content: '{"invalid": json}',
      };

      const result = tryParseContent(input);

      expect(result).toEqual(input);
    });

    test("handles unicode in JSON content", () => {
      const input = {
        content: '{"message": "你好世界"}',
      };

      const result = tryParseContent(input);

      expect(result).toEqual({
        content: { message: "你好世界" },
      });
    });
  });
});
