import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

function loadEnvFromDotEnvIfNeeded() {
  if (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE) {
    return;
  }

  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "NULL";
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function interpolateSql(sql: string, params: unknown[]): string {
  if (params.length === 0) {
    return sql;
  }
  const segments = sql.split("?");
  if (segments.length - 1 !== params.length) {
    throw new Error(`SQL placeholder count mismatch: expected ${segments.length - 1}, got ${params.length}`);
  }
  let out = segments[0];
  for (let i = 0; i < params.length; i += 1) {
    out += `${escapeSqlValue(params[i])}${segments[i + 1]}`;
  }
  return out;
}

function parseCell(value: string): string | number | null {
  if (value === "NULL") {
    return null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return value;
}

function parseMysqlBatchOutput<T>(stdout: string): T[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row: Record<string, string | number | null> = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = parseCell(cells[i] ?? "");
    }
    return row as T;
  });
}

function isIgnorableMysqlWarning(stderr: string): boolean {
  const normalized = stderr.trim();
  if (!normalized) {
    return true;
  }
  const lines = normalized.split(/\r?\n/).map((line) => line.trim());
  return lines.every((line) => line.startsWith("mysql: [Warning]"));
}

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  loadEnvFromDotEnvIfNeeded();
  const querySql = interpolateSql(sql, params);

  const mysqlBin = process.env.MYSQL_BIN || "mysql";
  const host = process.env.MYSQL_HOST || process.env.DB_HOST || "localhost";
  const user = process.env.MYSQL_USER || process.env.DB_USER || "";
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || "";
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME || "";

  const args = ["--batch", "--raw", `--host=${host}`];
  if (user) {
    args.push(`--user=${user}`);
  }
  if (password) {
    args.push(`--password=${password}`);
  }
  if (database) {
    args.push(database);
  }
  args.push("-e", querySql);

  const { stdout, stderr } = await execFileAsync(mysqlBin, args, {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stderr?.trim() && !isIgnorableMysqlWarning(stderr)) {
    throw new Error(stderr.trim());
  }
  return parseMysqlBatchOutput<T>(stdout);
}
