type CommandResult =
  | { kind: "command"; command: string; args: string[] }
  | { kind: "abort"; exitCode: number };

export function inferCommandRouting(token: string, args: string[]): CommandResult {
  if (!token) {
    return { kind: "command", command: token, args };
  }

  // Only explicit commands allowed - no magic inference
  if (isExplicitCommand(token)) {
    return { kind: "command", command: token, args };
  }

  // Unknown command - don't try to be clever
  return { kind: "command", command: token, args };
}

function isExplicitCommand(token: string): boolean {
  return token === "list" || token === "call";
}
