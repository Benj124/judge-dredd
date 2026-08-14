import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getRunHttp, listRunsHttp } from "./historyHttp";
import { migrate } from "./migrate";
import { closePool } from "./pool";
import {
  getEvaluateRun,
  listEvaluateRuns,
  parseRunFilters,
  saveEvaluateRun,
} from "./store";

after(async () => {
  await closePool();
});

function verdict(overrides: {
  rubricId: string;
  passed: boolean;
  overall: number;
  rationale: string;
}) {
  return {
    rubricId: overrides.rubricId,
    rubricVersion: "1",
    scores: [{ id: "accuracy", score: overrides.overall, rationale: "n" }],
    overall: overrides.overall,
    passed: overrides.passed,
    rationale: overrides.rationale,
  };
}

test("parseRunFilters maps rubric, pass/fail, and date bounds", () => {
  const filters = parseRunFilters({
    rubricId: " default ",
    passed: "fail",
    from: "2026-08-01",
    to: "2026-08-14",
  });
  assert.equal(filters.rubricId, "default");
  assert.equal(filters.passed, false);
  assert.equal(filters.from?.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(filters.to?.toISOString(), "2026-08-14T23:59:59.999Z");
});

test("listEvaluateRuns filters by rubric and pass/fail; getEvaluateRun returns saved fields", async () => {
  await migrate();
  const stamp = Date.now();
  const passRun = await saveEvaluateRun({
    subject: `history-pass-${stamp}`,
    verdict: verdict({
      rubricId: `hist-pass-${stamp}`,
      passed: true,
      overall: 4,
      rationale: `pass rationale ${stamp}`,
    }),
  });
  const failRun = await saveEvaluateRun({
    subject: `history-fail-${stamp}`,
    verdict: verdict({
      rubricId: `hist-fail-${stamp}`,
      passed: false,
      overall: 2,
      rationale: `fail rationale ${stamp}`,
    }),
  });

  const byPassRubric = await listEvaluateRuns({
    rubricId: `hist-pass-${stamp}`,
  });
  assert.ok(byPassRubric.some((run) => run.id === passRun.id));
  assert.equal(
    byPassRubric.some((run) => run.id === failRun.id),
    false,
  );

  const byFail = await listEvaluateRuns({
    passed: false,
    rubricId: `hist-fail-${stamp}`,
  });
  assert.ok(byFail.some((run) => run.id === failRun.id));
  assert.equal(
    byFail.some((run) => run.id === passRun.id),
    false,
  );

  const loaded = await getEvaluateRun(passRun.id);
  assert.ok(loaded);
  assert.equal(loaded.subject, passRun.subject);
  assert.equal(loaded.verdict.overall, 4);
  assert.equal(loaded.verdict.rationale, `pass rationale ${stamp}`);

  const future = await listEvaluateRuns({
    from: new Date("2099-01-01T00:00:00.000Z"),
  });
  assert.equal(
    future.some((run) => run.id === passRun.id || run.id === failRun.id),
    false,
  );
});

test("HTTP list and get-one use the shipped store filters", async () => {
  await migrate();
  const stamp = Date.now();
  const saved = await saveEvaluateRun({
    subject: `history-http-${stamp}`,
    verdict: verdict({
      rubricId: `hist-http-${stamp}`,
      passed: true,
      overall: 5,
      rationale: `http ${stamp}`,
    }),
  });

  const listed = await listRunsHttp(
    new Request(
      `http://local/api/runs?rubricId=${encodeURIComponent(`hist-http-${stamp}`)}`,
    ),
  );
  assert.equal(listed.status, 200);
  const listBody = (await listed.json()) as {
    ok: boolean;
    runs: Array<{ id: string; subject: string }>;
  };
  assert.equal(listBody.ok, true);
  assert.ok(listBody.runs.some((run) => run.id === saved.id));

  const one = await getRunHttp(saved.id);
  assert.equal(one.status, 200);
  const oneBody = (await one.json()) as {
    ok: boolean;
    run: { subject: string; verdict: { overall: number; rationale: string } };
  };
  assert.equal(oneBody.run.subject, saved.subject);
  assert.equal(oneBody.run.verdict.overall, 5);
  assert.equal(oneBody.run.verdict.rationale, `http ${stamp}`);
});
