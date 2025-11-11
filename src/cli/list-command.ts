import ora from "ora";
import type { ServerDefinition } from "@/config.js";
import type { EphemeralServerSpec } from "@/cli/adhoc-server.js";
import { extractEphemeralServerFlags } from "@/cli/ephemeral-flags.js";
import { prepareEphemeralServerTarget } from "@/cli/ephemeral-target.js";
import { splitHttpToolSelector } from "@/cli/http-utils.js";
import {
  chooseClosestIdentifier,
  renderIdentifierResolutionMessages,
} from "@/cli/identifier-helpers.js";
import type { ListSummaryResult, StatusCategory } from "@/cli/list-format.js";
import { classifyListError, formatSourceSuffix, renderServerListRow } from "@/cli/list-format.js";
import {
  buildJsonListEntry,
  createEmptyStatusCounts,
  createUnknownResult,
  type ListJsonServerEntry,
  printSingleServerHeader,
  printToolDetail,
  summarizeStatusCounts,
} from "@/cli/list-output.js";
import { consumeOutputFormat } from "@/cli/output-format.js";
import { dimText, supportsSpinner, yellowText } from "@/cli/terminal.js";
import { consumeTimeoutFlag, LIST_TIMEOUT_MS, withTimeout } from "@/cli/timeouts.js";
import { loadToolMetadata } from "@/cli/tool-cache.js";
import { formatTransportSummary } from "@/cli/transport-utils.js";

export function extractListFlags(args: string[]): {
  timeoutMs?: number;
  ephemeral?: EphemeralServerSpec;
  format: ListOutputFormat;
} {
  let timeoutMs: number | undefined;
  const format = consumeOutputFormat(args, {
    defaultFormat: "text",
    allowed: ["text", "json"],
    enableRawShortcut: false,
  }) as ListOutputFormat;
  const ephemeral = extractEphemeralServerFlags(args);
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token === "--yes") {
      args.splice(index, 1);
      continue;
    }
    if (token === "--timeout") {
      timeoutMs = consumeTimeoutFlag(args, index, { flagName: "--timeout" });
      continue;
    }
    index += 1;
  }
  return { timeoutMs, ephemeral, format };
}

type ListOutputFormat = "text" | "json";

export async function handleList(
  runtime: Awaited<ReturnType<(typeof import("../runtime.js"))["createRuntime"]>>,
  args: string[],
): Promise<void> {
  const flags = extractListFlags(args);
  let target = args.shift();

  if (target) {
    const split = splitHttpToolSelector(target);
    if (split) {
      target = split.baseUrl;
    }
  }

  const prepared = await prepareEphemeralServerTarget({
    runtime,
    target,
    ephemeral: flags.ephemeral,
  });
  target = prepared.target;

  if (!target) {
    const servers = runtime.getDefinitions();
    const perServerTimeoutMs = flags.timeoutMs ?? LIST_TIMEOUT_MS;
    const perServerTimeoutSeconds = Math.round(perServerTimeoutMs / 1000);

    if (servers.length === 0) {
      if (flags.format === "json") {
        const payload = {
          mode: "list",
          counts: createEmptyStatusCounts(),
          servers: [] as ListJsonServerEntry[],
        };
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log("No MCP servers configured.");
      }
      return;
    }

    if (flags.format === "text") {
      console.log(
        `Listing ${servers.length} server(s) (per-server timeout: ${perServerTimeoutSeconds}s)`,
      );
    }
    const spinner =
      flags.format === "text" && supportsSpinner
        ? ora(`Discovering ${servers.length} server(s)…`).start()
        : undefined;
    const renderedResults =
      flags.format === "text"
        ? (Array.from({ length: servers.length }, () => undefined) as Array<
            ReturnType<typeof renderServerListRow> | undefined
          >)
        : undefined;
    const summaryResults: Array<ListSummaryResult | undefined> = Array.from(
      { length: servers.length },
      () => undefined,
    );
    let completedCount = 0;

    const tasks = servers.map((server, index) =>
      (async (): Promise<ListSummaryResult> => {
        const startedAt = Date.now();
        try {
          const tools = await withTimeout(
            runtime.listTools(server.name, { autoAuthorize: false }),
            perServerTimeoutMs,
          );
          return {
            server,
            status: "ok" as const,
            tools,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return {
            server,
            status: "error" as const,
            error,
            durationMs: Date.now() - startedAt,
          };
        }
      })().then((result) => {
        summaryResults[index] = result;
        if (renderedResults) {
          const rendered = renderServerListRow(result, perServerTimeoutMs);
          renderedResults[index] = rendered;
          completedCount += 1;
          if (spinner) {
            spinner.stop();
            console.log(rendered.line);
            const remaining = servers.length - completedCount;
            if (remaining > 0) {
              spinner.text = `Listing servers… ${completedCount}/${servers.length}`;
              spinner.start();
            }
          } else {
            console.log(rendered.line);
          }
        }
        return result;
      }),
    );

    await Promise.all(tasks);

    if (flags.format === "json") {
      const jsonEntries = summaryResults.map((entry, index) => {
        const serverDefinition = servers[index] ?? entry?.server ?? servers[0];
        if (!serverDefinition) {
          throw new Error("Unable to resolve server definition for JSON output.");
        }
        const normalizedEntry = entry ?? createUnknownResult(serverDefinition);
        return buildJsonListEntry(normalizedEntry, perServerTimeoutSeconds);
      });
      const counts = summarizeStatusCounts(jsonEntries);
      console.log(JSON.stringify({ mode: "list", counts, servers: jsonEntries }, null, 2));
      return;
    }

    if (spinner) {
      spinner.stop();
    }
    const errorCounts = createEmptyStatusCounts();
    renderedResults?.forEach((entry) => {
      if (!entry) {
        return;
      }
      const category = entry.category ?? "error";
      errorCounts[category] = (errorCounts[category] ?? 0) + 1;
    });
    const okSummary = `${errorCounts.ok} healthy`;
    const parts = [
      okSummary,
      ...(errorCounts.auth > 0 ? [`${errorCounts.auth} auth required`] : []),
      ...(errorCounts.offline > 0 ? [`${errorCounts.offline} offline`] : []),
      ...(errorCounts.http > 0 ? [`${errorCounts.http} http errors`] : []),
      ...(errorCounts.error > 0 ? [`${errorCounts.error} errors`] : []),
    ];
    console.log(
      `✔ Listed ${servers.length} server${servers.length === 1 ? "" : "s"} (${parts.join("; ")}).`,
    );
    return;
  }

  const resolved = resolveServerDefinition(runtime, target);
  if (!resolved) {
    return;
  }
  target = resolved.name;
  const definition = resolved.definition;
  const timeoutMs = flags.timeoutMs ?? LIST_TIMEOUT_MS;
  const sourcePath =
    definition.source?.kind === "import" || definition.source?.kind === "local"
      ? formatSourceSuffix(definition.source, true)
      : undefined;
  const transportSummary = formatTransportSummary(definition);
  const startedAt = Date.now();
  if (flags.format === "json") {
    try {
      const metadataEntries = await withTimeout(loadToolMetadata(runtime, target), timeoutMs);
      const durationMs = Date.now() - startedAt;
      const payload = {
        mode: "server",
        name: definition.name,
        status: "ok" as StatusCategory,
        durationMs,
        description: definition.description,
        transport: transportSummary,
        source: definition.source,
        tools: metadataEntries.map((entry) => ({
          name: entry.tool.name,
          description: entry.tool.description,
          inputSchema: entry.tool.inputSchema,
          outputSchema: entry.tool.outputSchema,
          options: entry.options,
        })),
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const advice = classifyListError(error, definition.name, timeoutMs);
      const payload = {
        mode: "server",
        name: definition.name,
        status: advice.category,
        durationMs,
        description: definition.description,
        transport: transportSummary,
        source: definition.source,
        issue: advice.issue,
        error: advice.summary,
      };
      console.log(JSON.stringify(payload, null, 2));
      process.exitCode = 1;
      return;
    }
  }
  try {
    const metadataEntries = await withTimeout(loadToolMetadata(runtime, target), timeoutMs);
    const durationMs = Date.now() - startedAt;
    printSingleServerHeader(
      definition,
      metadataEntries.length,
      durationMs,
      transportSummary,
      sourcePath,
    );
    if (metadataEntries.length === 0) {
      console.log("  Tools: <none>");
      console.log("");
      return;
    }

    for (const entry of metadataEntries) {
      printToolDetail(definition, entry);
    }
    return;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    printSingleServerHeader(definition, undefined, durationMs, transportSummary, sourcePath);
    const message = error instanceof Error ? error.message : "Failed to load tool list.";
    const timeoutMs = flags.timeoutMs ?? LIST_TIMEOUT_MS;
    const advice = classifyListError(error, definition.name, timeoutMs);
    console.warn(`  Tools: <timed out after ${timeoutMs}ms>`);
    console.warn(`  Reason: ${message}`);
    if (advice.category === "auth") {
      console.warn(`  Next: Run this command again to trigger OAuth authentication.`);
    }
  }
}

function resolveServerDefinition(
  runtime: Awaited<ReturnType<(typeof import("../runtime.js"))["createRuntime"]>>,
  name: string,
): { definition: ServerDefinition; name: string } | undefined {
  try {
    const definition = runtime.getDefinition(name);
    return { definition, name };
  } catch (error) {
    if (!(error instanceof Error) || !/Unknown MCP server/i.test(error.message)) {
      throw error;
    }
    const suggestion = suggestServerName(runtime, name);
    if (!suggestion) {
      console.error(error.message);
      return undefined;
    }
    const messages = renderIdentifierResolutionMessages({
      entity: "server",
      attempted: name,
      resolution: suggestion,
    });
    if (suggestion.kind === "auto" && messages.auto) {
      console.log(dimText(messages.auto));
      return resolveServerDefinition(runtime, suggestion.value);
    }
    if (messages.suggest) {
      console.error(yellowText(messages.suggest));
    }
    console.error(error.message);
    return undefined;
  }
}

function suggestServerName(
  runtime: Awaited<ReturnType<(typeof import("../runtime.js"))["createRuntime"]>>,
  attempted: string,
) {
  const definitions = runtime.getDefinitions();
  const names = definitions.map((entry) => entry.name);
  return chooseClosestIdentifier(attempted, names);
}
