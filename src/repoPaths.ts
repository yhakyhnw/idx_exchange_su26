import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function srcDir(importMetaUrl: string): string {
  return path.dirname(fileURLToPath(importMetaUrl));
}

export function redactLocalPaths(text: string): string {
  if (!text) return text;
  const home = os.homedir();
  return home ? text.split(home).join("~") : text;
}

export function spawnPythonFromSrc(
  importMetaUrl: string,
  scriptName: string,
  args: string[],
): SpawnSyncReturns<string> {
  return spawnSync("python3", [scriptName, ...args], {
    encoding: "utf8",
    cwd: srcDir(importMetaUrl),
  });
}
