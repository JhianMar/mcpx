/**
 * Custom error class that carries server/tool context for better error reporting
 */
export class McpxError extends Error {
  constructor(
    message: string,
    public readonly context?: {
      server?: string;
      tool?: string;
    },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "McpxError";
  }
}
