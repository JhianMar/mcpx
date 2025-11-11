import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseBatchCalls, parseCallLine, readStdin } from "../src/cli/stdin-batch.js";

describe("parseCallLine", () => {
  describe("new syntax (JSON object)", () => {
    test("parses new syntax with name and args", () => {
      const line = '{ name: "server.tool", args: { key: "value" } }';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { key: "value" },
      });
    });

    test("parses new syntax with quoted name", () => {
      const line = '{ "name": "my-server.my_tool", "args": { "a": 1, "b": 2 } }';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "my-server",
        tool: "my_tool",
        args: { a: 1, b: 2 },
      });
    });

    test("parses new syntax with nested args", () => {
      const line = '{ name: "server.tool", args: { user: { name: "test" } } }';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { user: { name: "test" } },
      });
    });

    test("parses new syntax with empty args", () => {
      const line = '{ name: "server.tool", args: {} }';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: {},
      });
    });
  });

  describe("old syntax (function call)", () => {
    test("parses basic call with JSON args", () => {
      const line = 'server.tool({ "key": "value" })';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { key: "value" },
      });
    });

    test("parses call with hyphenated server name", () => {
      const line = 'my-server.tool({ "key": "value" })';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "my-server",
        tool: "tool",
        args: { key: "value" },
      });
    });

    test("parses call with underscored names", () => {
      const line = 'my_server.my_tool({ "key": "value" })';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "my_server",
        tool: "my_tool",
        args: { key: "value" },
      });
    });

    test("handles whitespace around call", () => {
      const line = '  server.tool( { "key": "value" } )  ';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { key: "value" },
      });
    });

    test("parses empty args object", () => {
      const line = "server.tool({})";
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: {},
      });
    });

    test("parses args with multiple properties", () => {
      const line = 'server.tool({ "a": 1, "b": "two", "c": true })';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { a: 1, b: "two", c: true },
      });
    });

    test("parses nested object args", () => {
      const line = 'server.tool({ "user": { "name": "test", "age": 25 } })';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { user: { name: "test", age: 25 } },
      });
    });

    test("parses array in args", () => {
      const line = 'server.tool({ "items": [1, 2, 3] })';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { items: [1, 2, 3] },
      });
    });
  });

  describe("JSON5 syntax support", () => {
    test("parses unquoted property names", () => {
      const line = 'server.tool({ key: "value" })';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { key: "value" },
      });
    });

    test("parses single-quoted strings", () => {
      const line = "server.tool({ key: 'value' })";
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { key: "value" },
      });
    });

    test("parses trailing commas", () => {
      const line = 'server.tool({ key: "value", })';
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { key: "value" },
      });
    });

    test("parses mixed JSON5 features", () => {
      const line = "server.tool({ a: 'value', b: 123, })";
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { a: "value", b: 123 },
      });
    });

    test("parses multiline args with JSON5", () => {
      const line = `server.tool({
        key1: 'value1',
        key2: 123,
      })`;
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { key1: "value1", key2: 123 },
      });
    });
  });

  describe("comment and empty line handling", () => {
    test("returns null for empty line", () => {
      const result = parseCallLine("");
      expect(result).toBeNull();
    });

    test("returns null for whitespace-only line", () => {
      const result = parseCallLine("   \t  ");
      expect(result).toBeNull();
    });

    test("returns null for hash comment", () => {
      const result = parseCallLine("# This is a comment");
      expect(result).toBeNull();
    });

    test("returns null for double-slash comment", () => {
      const result = parseCallLine("// This is a comment");
      expect(result).toBeNull();
    });

    test("returns null for indented comment", () => {
      const result = parseCallLine("  # Comment with indentation");
      expect(result).toBeNull();
    });
  });

  describe("error cases", () => {
    test("throws on missing server name", () => {
      const line = '.tool({ key: "value" })';
      expect(() => parseCallLine(line)).toThrow("Invalid call syntax");
    });

    test("throws on missing tool name", () => {
      const line = 'server.({ key: "value" })';
      expect(() => parseCallLine(line)).toThrow("Invalid call syntax");
    });

    test("throws on missing args", () => {
      const line = "server.tool()";
      expect(() => parseCallLine(line)).toThrow("Invalid call syntax");
    });

    test("throws on missing parentheses", () => {
      const line = 'server.tool{ key: "value" }';
      expect(() => parseCallLine(line)).toThrow("Invalid call syntax");
    });

    test("throws on malformed JSON", () => {
      const line = "server.tool({ key: invalid })";
      expect(() => parseCallLine(line)).toThrow("Failed to parse arguments");
    });

    test("throws on array instead of object args", () => {
      const line = "server.tool([1, 2, 3])";
      expect(() => parseCallLine(line)).toThrow("Invalid call syntax");
    });

    test("throws on string instead of object args", () => {
      const line = 'server.tool("string")';
      expect(() => parseCallLine(line)).toThrow("Invalid call syntax");
    });

    test("throws on null args", () => {
      const line = "server.tool(null)";
      expect(() => parseCallLine(line)).toThrow("Invalid call syntax");
    });

    test("throws on unclosed braces", () => {
      const line = 'server.tool({ key: "value")';
      expect(() => parseCallLine(line)).toThrow("Invalid call syntax");
    });

    test("provides context in error message", () => {
      const line = "myserver.mytool({ bad: json })";
      expect(() => parseCallLine(line)).toThrow("myserver.mytool");
    });
  });

  describe("edge cases", () => {
    test("handles numeric server names", () => {
      const line = 'server123.tool({ key: "value" })';
      const result = parseCallLine(line);

      expect(result?.server).toBe("server123");
    });

    test("handles special characters in string values", () => {
      const line = 'server.tool({ key: "value with spaces & symbols!" })';
      const result = parseCallLine(line);

      expect(result?.args.key).toBe("value with spaces & symbols!");
    });

    test("handles unicode in values", () => {
      const line = 'server.tool({ key: "你好世界" })';
      const result = parseCallLine(line);

      expect(result?.args.key).toBe("你好世界");
    });

    test("handles null values in args", () => {
      const line = "server.tool({ key: null })";
      const result = parseCallLine(line);

      expect(result?.args.key).toBeNull();
    });

    test("handles boolean values in args", () => {
      const line = "server.tool({ a: true, b: false })";
      const result = parseCallLine(line);

      expect(result).toEqual({
        server: "server",
        tool: "tool",
        args: { a: true, b: false },
      });
    });

    test("handles zero and negative numbers", () => {
      const line = "server.tool({ zero: 0, negative: -42 })";
      const result = parseCallLine(line);

      expect(result?.args).toEqual({ zero: 0, negative: -42 });
    });

    test("handles floating point numbers", () => {
      const line = "server.tool({ value: 42.5 })";
      const result = parseCallLine(line);

      expect(result?.args.value).toBe(42.5);
    });
  });
});

describe("parseBatchCalls", () => {
  test("parses multiple valid calls", () => {
    const input = `server1.tool1({ key: "value1" })
server2.tool2({ key: "value2" })`;

    const results = parseBatchCalls(input);

    expect(results).toEqual([
      { server: "server1", tool: "tool1", args: { key: "value1" } },
      { server: "server2", tool: "tool2", args: { key: "value2" } },
    ]);
  });

  test("skips empty lines between calls", () => {
    const input = `server1.tool1({ key: "value1" })

server2.tool2({ key: "value2" })`;

    const results = parseBatchCalls(input);

    expect(results).toHaveLength(2);
  });

  test("skips comment lines", () => {
    const input = `# Comment 1
server1.tool1({ key: "value1" })
// Comment 2
server2.tool2({ key: "value2" })`;

    const results = parseBatchCalls(input);

    expect(results).toHaveLength(2);
  });

  test("handles mixed comments and empty lines", () => {
    const input = `
# Header comment
server1.tool1({ key: "value1" })

// Another comment
server2.tool2({ key: "value2" })

`;

    const results = parseBatchCalls(input);

    expect(results).toHaveLength(2);
  });

  test("returns empty array for empty input", () => {
    const results = parseBatchCalls("");
    expect(results).toEqual([]);
  });

  test("returns empty array for only comments", () => {
    const input = `# Comment 1
// Comment 2
# Comment 3`;

    const results = parseBatchCalls(input);

    expect(results).toEqual([]);
  });

  test("returns empty array for only whitespace", () => {
    const input = "   \n  \n\t\n  ";
    const results = parseBatchCalls(input);

    expect(results).toEqual([]);
  });

  test("handles calls with varying whitespace", () => {
    const input = `server1.tool1({ key: "value1" })
  server2.tool2({ key: "value2" })
    server3.tool3({ key: "value3" })`;

    const results = parseBatchCalls(input);

    expect(results).toHaveLength(3);
  });

  test("throws on first invalid call", () => {
    const input = `server1.tool1({ key: "value1" })
invalid syntax here
server3.tool3({ key: "value3" })`;

    expect(() => parseBatchCalls(input)).toThrow("Invalid call syntax");
  });

  test("throws on malformed JSON in batch", () => {
    const input = `server1.tool1({ key: "value1" })
server2.tool2({ bad: json })`;

    expect(() => parseBatchCalls(input)).toThrow("Failed to parse arguments");
  });

  test("preserves order of calls", () => {
    const input = `server1.tool1({ order: 1 })
server2.tool2({ order: 2 })
server3.tool3({ order: 3 })`;

    const results = parseBatchCalls(input);

    expect(results.map((r) => r.args.order)).toEqual([1, 2, 3]);
  });

  test("handles same tool called multiple times", () => {
    const input = `server.tool({ run: 1 })
server.tool({ run: 2 })
server.tool({ run: 3 })`;

    const results = parseBatchCalls(input);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.server === "server" && r.tool === "tool")).toBe(true);
  });

  test("handles complex multiline batch", () => {
    const input = `# Batch execution example
# Server 1 calls
server1.tool1({ key: "value1" })
server1.tool2({ key: "value2" })

// Server 2 calls
server2.tool1({ key: "value3" })

# Mixed
server3.tool1({ key: "value4" })`;

    const results = parseBatchCalls(input);

    expect(results).toHaveLength(4);
  });
});

describe("readStdin", () => {
  let originalStdin: typeof process.stdin;
  let _mockIsTTY: boolean;

  beforeEach(() => {
    originalStdin = process.stdin;
    _mockIsTTY = false;
  });

  afterEach(() => {
    // Restore original stdin
    Object.defineProperty(process, "stdin", {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  });

  function mockStdin(chunks: string[], isTTY = false): void {
    const buffers = chunks.map((chunk) => Buffer.from(chunk));
    const readable = Readable.from(buffers);
    Object.defineProperty(readable, "isTTY", {
      value: isTTY,
      writable: false,
    });
    Object.defineProperty(process, "stdin", {
      value: readable,
      writable: true,
      configurable: true,
    });
  }

  test("reads single chunk from stdin", async () => {
    mockStdin(["hello world"]);

    const result = await readStdin();

    expect(result).toBe("hello world");
  });

  test("reads multiple chunks and concatenates", async () => {
    mockStdin(["hello ", "world", "!"]);

    const result = await readStdin();

    expect(result).toBe("hello world!");
  });

  test("handles empty stdin", async () => {
    mockStdin([]);

    const result = await readStdin();

    expect(result).toBe("");
  });

  test("returns empty string when stdin is TTY", async () => {
    mockStdin(["some data"], true);

    const result = await readStdin();

    expect(result).toBe("");
  });

  test("handles unicode content", async () => {
    mockStdin(["你好", "世界"]);

    const result = await readStdin();

    expect(result).toBe("你好世界");
  });

  test("handles newlines and whitespace", async () => {
    mockStdin(["line1\n", "line2\n", "line3"]);

    const result = await readStdin();

    expect(result).toBe("line1\nline2\nline3");
  });

  test("handles large content", async () => {
    const largeText = "x".repeat(10000);
    mockStdin([largeText]);

    const result = await readStdin();

    expect(result).toBe(largeText);
  });

  test("handles binary data as utf-8", async () => {
    mockStdin([Buffer.from("test").toString()]);

    const result = await readStdin();

    expect(result).toBe("test");
  });
});
