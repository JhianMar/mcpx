import type { OutputFormat } from "@/cli/output-utils.js";

interface ConsumeOutputOptions {
  defaultFormat?: OutputFormat;
  allowed?: OutputFormat[];
  enableRawShortcut?: boolean;
}

export function consumeOutputFormat(
  args: string[],
  options: ConsumeOutputOptions = {},
): OutputFormat {
  const allowed = options.allowed ?? ["auto", "text", "json", "toon", "raw"];
  const defaultFormat = options.defaultFormat ?? "toon";
  const enableRawShortcut = options.enableRawShortcut !== false;
  let format: OutputFormat = defaultFormat;

  const isAllowed = (value: OutputFormat): boolean => allowed.includes(value);

  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token === "--output") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Flag '--output' requires a value.");
      }
      if (!isCliOutputFormat(value)) {
        throw new Error("--output format must be one of: auto, text, json, toon, raw.");
      }
      if (!isAllowed(value)) {
        throw new Error(`--output format '${value}' is not supported for this command.`);
      }
      format = value;
      args.splice(index, 2);
      continue;
    }
    if (enableRawShortcut && token === "--raw") {
      if (!isAllowed("raw")) {
        throw new Error("--raw is not supported for this command.");
      }
      format = "raw";
      args.splice(index, 1);
      continue;
    }
    index += 1;
  }

  if (!isAllowed(format)) {
    throw new Error(`Format '${format}' is not supported for this command.`);
  }
  return format;
}

export function isCliOutputFormat(value: string): value is OutputFormat {
  return (
    value === "auto" || value === "text" || value === "json" || value === "toon" || value === "raw"
  );
}
