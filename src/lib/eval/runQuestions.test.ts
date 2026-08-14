import assert from "node:assert/strict";
import { test } from "node:test";
import { stubComplete } from "./complete";
import { evaluatePointwise } from "./pipeline";
import {
  loadQuestions,
  parseQuestions,
  questionToEvaluateBody,
} from "./questions";
import { formatQuestionReport, runQuestions } from "./runQuestions";
import { DEFAULT_RUBRIC } from "./rubrics";

test("committed question set has multiple non-empty subjects", () => {
  const questions = loadQuestions();
  assert.ok(questions.length > 1);
  const ids = new Set<string>();
  for (const question of questions) {
    assert.ok(question.id.trim());
    assert.ok(question.subject.trim());
    assert.equal(ids.has(question.id), false);
    ids.add(question.id);
  }
});

test("questionToEvaluateBody maps each fixture onto the shipped evaluate entry", async () => {
  const questions = loadQuestions();
  assert.ok(questions.some((question) => question.title));
  for (const question of questions) {
    const body = questionToEvaluateBody(question);
    assert.equal(body.subject, question.subject);
    assert.equal(body.rubricId, "default");
    const result = await evaluatePointwise(body, { complete: stubComplete });
    assert.equal(result.ok, true, question.id);
    if (!result.ok) continue;
    assert.equal(typeof result.verdict.overall, "number");
    assert.ok(result.verdict.rationale.trim());
  }
});

test("parseQuestions rejects a question with an empty subject", () => {
  assert.throws(
    () =>
      parseQuestions([
        { id: "bad", subject: "   " },
        { id: "ok", subject: "hello" },
      ]),
    /missing a subject/,
  );
});

test("real questions run through shipped evaluate with a fake judge", async () => {
  const questions = loadQuestions();
  let completeCalls = 0;
  const complete = async (input: { user: string; system: string; model: string }) => {
    completeCalls += 1;
    return stubComplete(input);
  };

  const runs = await runQuestions(questions, complete);
  assert.equal(runs.length, questions.length);
  assert.equal(completeCalls, questions.length);

  for (const run of runs) {
    assert.equal(run.result.ok, true, run.id);
    if (!run.result.ok) continue;
    const { verdict } = run.result;
    assert.equal(typeof verdict.overall, "number");
    assert.ok(Number.isFinite(verdict.overall));
    assert.equal(typeof verdict.rationale, "string");
    assert.ok(verdict.rationale.trim().length > 0);
    assert.equal(verdict.scores.length, DEFAULT_RUBRIC.criteria.length);
    for (const criterion of DEFAULT_RUBRIC.criteria) {
      const score = verdict.scores.find((entry) => entry.id === criterion.id);
      assert.ok(score, `${run.id} missing ${criterion.id}`);
      assert.ok(
        score.score >= criterion.scale.min && score.score <= criterion.scale.max,
        `${run.id} ${criterion.id} out of scale`,
      );
    }
  }
});

test("question report prints one block per question with overall and rationale", async () => {
  const questions = loadQuestions();
  const runs = await runQuestions(questions, stubComplete);
  const report = formatQuestionReport(runs);
  for (const question of questions) {
    assert.match(report, new RegExp(`=== ${question.id} ===`));
  }
  assert.equal((report.match(/^=== /gm) ?? []).length, questions.length);
  assert.match(report, /overall:/);
  assert.match(report, /rationale:/);
  assert.doesNotMatch(report, /https:\/\/api\.x\.ai/);
});
