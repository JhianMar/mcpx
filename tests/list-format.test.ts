import { describe, expect, it } from "vitest";

import { classifyListError } from "../src/cli/list-format.js";

describe("classifyListError", () => {
  it("classifies 401 errors as auth required", () => {
    const result = classifyListError(
      new Error("SSE error: Non-200 status code (401)"),
      "adhoc-server",
      30,
    );
    expect(result.category).toBe("auth");
    expect(result.colored).toContain("OAuth required");
    expect(result.issue?.kind).toBe("auth");
  });

  it("classifies transport errors as offline", () => {
    const result = classifyListError(
      new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:3000"),
      "local",
      30,
    );
    expect(result.category).toBe("offline");
    expect(result.summary).toBe("offline");
    expect(result.issue?.kind).toBe("offline");
  });

  it("classifies HTTP errors separately", () => {
    const result = classifyListError(
      new Error("HTTP error 500: upstream unavailable"),
      "remote",
      30,
    );
    expect(result.category).toBe("http");
    expect(result.summary).toContain("http 500");
    expect(result.issue?.kind).toBe("http");
  });
});
