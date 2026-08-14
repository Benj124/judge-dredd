import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEvalCsv } from "../db/dataset";

test("eval_data.csv loads as runnable jobs with expected-fact references", () => {
  const jobs = loadEvalCsv("eval_data.csv");
  assert.ok(jobs.length > 1);
  for (const job of jobs) {
    assert.ok(job.id.trim());
    assert.ok(job.subject.trim());
    assert.ok((job.reference ?? "").trim(), job.id);
  }
  assert.ok(jobs.some((job) => /Canberra/i.test(job.reference ?? "")));
  assert.ok(jobs.some((job) => /Sydney/i.test(job.subject)));
});
