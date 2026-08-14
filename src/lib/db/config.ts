import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readDatabaseUrlFromEnvFile(): string | undefined {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^DATABASE_URL\s*=\s*(.*)$/);
    if (!match) continue;
    return match[1].replace(/^['"]|['"]$/g, "").trim();
  }
  return undefined;
}

export function getDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const url = env.DATABASE_URL?.trim() || readDatabaseUrlFromEnvFile();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and run npm run db:up",
    );
  }
  if (/rds\.amazonaws\.com|amazonaws\.com/i.test(url)) {
    throw new Error("DATABASE_URL points at AWS; use local Postgres for this path");
  }
  return url;
}
