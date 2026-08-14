import assert from "node:assert/strict";
import { test } from "node:test";
import { getDatabaseUrl } from "./config";

test("local DATABASE_URL is accepted; AWS URLs are not", () => {
  assert.equal(
    getDatabaseUrl({
      DATABASE_URL: "postgres://judge@localhost:5432/judge_dredd",
    } as unknown as NodeJS.ProcessEnv),
    "postgres://judge@localhost:5432/judge_dredd",
  );
  assert.throws(
    () =>
      getDatabaseUrl({
        DATABASE_URL: "postgres://u:p@foo.rds.amazonaws.com:5432/db",
      } as unknown as NodeJS.ProcessEnv),
    /AWS/,
  );
});
