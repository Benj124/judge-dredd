import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_DATABASE_NAME,
  DEFAULT_DATABASE_URL,
  getDatabaseUrl,
} from "./config";

test("local DATABASE_URL is accepted; AWS URLs are not", () => {
  assert.equal(
    getDatabaseUrl({
      DATABASE_URL: DEFAULT_DATABASE_URL,
    } as unknown as NodeJS.ProcessEnv),
    DEFAULT_DATABASE_URL,
  );
  assert.throws(
    () =>
      getDatabaseUrl({
        DATABASE_URL: "postgres://u:p@foo.rds.amazonaws.com:5432/db",
      } as unknown as NodeJS.ProcessEnv),
    /AWS/,
  );
});

test("default local database identifier is not judge_dredd", () => {
  assert.equal(DEFAULT_DATABASE_NAME, "synthkit");
  assert.doesNotMatch(DEFAULT_DATABASE_URL, /judge_dredd/);
  assert.match(DEFAULT_DATABASE_URL, /\/synthkit$/);

  const root = join(process.cwd());
  const files = [
    ".env.example",
    "docker-compose.yml",
    "scripts/db-up.sh",
    ".github/workflows/test.yml",
    "README.md",
  ];
  for (const rel of files) {
    const text = readFileSync(join(root, rel), "utf8");
    assert.doesNotMatch(
      text,
      /judge_dredd/,
      `${rel} must not use judge_dredd as the default DB name`,
    );
    if (rel !== "README.md") {
      assert.match(text, /synthkit/, `${rel} should mention synthkit`);
    }
  }
  assert.match(
    readFileSync(join(root, "README.md"), "utf8"),
    /5432\/synthkit/,
  );
});
