import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRubric, precheck } from "./checks";
import { DEFAULT_RUBRIC } from "./rubrics";

const validCustom = {
  id: "custom-strict",
  version: "2",
  name: "Custom strict",
  description: "Two-criterion custom rubric",
  overallPassRule: "all_must_pass" as const,
  overallPassThreshold: 3,
  criteria: [
    {
      id: "accuracy",
      name: "Accuracy",
      description: "Correctness",
      scale: { min: 1, max: 5 },
      weight: 2,
      passThreshold: 3,
    },
    {
      id: "clarity",
      name: "Clarity",
      description: "Readable",
      scale: { min: 0, max: 1 },
      weight: 1,
    },
  ],
};

test("parseRubric accepts a well-formed custom rubric", () => {
  const rubric = parseRubric(validCustom);
  assert.ok(rubric);
  assert.equal(rubric.id, "custom-strict");
  assert.equal(rubric.version, "2");
  assert.equal(rubric.overallPassRule, "all_must_pass");
  assert.equal(rubric.criteria.length, 2);
  assert.equal(rubric.criteria[0].weight, 2);
  assert.equal(rubric.criteria[1].scale.max, 1);
});

test("parseRubric rejects missing fields, bad scale, and duplicate ids", () => {
  assert.equal(parseRubric(null), null);
  assert.equal(parseRubric("nope"), null);
  assert.equal(parseRubric({ ...validCustom, id: "  " }), null);
  assert.equal(parseRubric({ ...validCustom, overallPassRule: "maybe" }), null);
  assert.equal(parseRubric({ ...validCustom, criteria: [] }), null);
  assert.equal(
    parseRubric({
      ...validCustom,
      criteria: [
        validCustom.criteria[0],
        { ...validCustom.criteria[1], id: validCustom.criteria[0].id },
      ],
    }),
    null,
  );
  assert.equal(
    parseRubric({
      ...validCustom,
      criteria: [
        { ...validCustom.criteria[0], scale: { min: 5, max: 1 } },
      ],
    }),
    null,
  );
  assert.equal(
    parseRubric({
      ...validCustom,
      criteria: [{ ...validCustom.criteria[0], weight: 0 }],
    }),
    null,
  );
});

test("precheck accepts a custom rubric and trims optional fields", async () => {
  const job = await precheck({
    subject: "  Paris is the capital.  ",
    context: "  What is the capital of France?  ",
    reference: "  Paris  ",
    rubric: validCustom,
  });
  assert.ok(!("ok" in job));
  assert.equal(job.subject, "Paris is the capital.");
  assert.equal(job.context, "  What is the capital of France?  ");
  assert.equal(job.reference, "  Paris  ");
  assert.equal(job.rubric.id, "custom-strict");
  assert.equal(job.rubric.criteria.length, 2);
});

test("precheck falls back to the default rubric and rejects unknown or invalid ones", async () => {
  const fallback = await precheck({ subject: "hello" });
  assert.ok(!("ok" in fallback));
  assert.equal(fallback.rubric.id, DEFAULT_RUBRIC.id);

  const unknown = await precheck({ subject: "hello", rubricId: "does-not-exist" });
  assert.ok("ok" in unknown);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "precheck");
  assert.match(unknown.error, /Unknown rubricId/);

  const invalid = await precheck({ subject: "hello", rubric: { id: "bad" } });
  assert.ok("ok" in invalid);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /rubric is invalid/);

  const notObject = await precheck([]);
  assert.ok("ok" in notObject);
  assert.equal(notObject.ok, false);
});
