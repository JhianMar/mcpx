import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadServerDefinitions } from "../src/config.js";

describe("loadServerDefinitions when config is optional", () => {
  it("returns an empty list when the default config is missing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcpx-config-missing-"));
    try {
      const servers = await loadServerDefinitions({ rootDir: tempDir });
      expect(servers).toEqual([]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("still throws when an explicit config path is missing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcpx-config-explicit-"));
    const explicitPath = path.join(tempDir, "does-not-exist.json");
    await expect(loadServerDefinitions({ configPath: explicitPath })).rejects.toThrow();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
});
