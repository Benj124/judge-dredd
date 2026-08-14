import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool } from "../db/pool";
import { deleteStoredRubric, saveStoredRubric } from "../db/store";
import {
  evaluateHttp,
  getAgenticOptionsHttp,
  listRubricsHttp,
  saveAgenticOptionsHttp,
  saveRubricHttp,
} from "./http";
import { DEFAULT_JUDGE_MODEL } from "./models";
import { DEFAULT_RUBRIC } from "./rubrics";
import { XAI_BASE_URL } from "./xai";

const originalStub = process.env.EVAL_LLM_STUB;
const originalKey = process.env.XAI_API_KEY;
const disposableRubricIds: string[] = [];

function trackRubricId(id: string): string {
  disposableRubricIds.push(id);
  return id;
}

afterEach(() => {
  if (originalStub === undefined) delete process.env.EVAL_LLM_STUB;
  else process.env.EVAL_LLM_STUB = originalStub;
  if (originalKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = originalKey;
});

after(async () => {
  for (const id of disposableRubricIds) {
    try {
      await deleteStoredRubric(id);
    } catch {
      // best-effort cleanup
    }
  }
  await closePool();
});

function post(body: unknown): Promise<Response> {
  return evaluateHttp(
    new Request("http://local/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("HTTP evaluate with stub judge returns structured verdict JSON", async () => {
  process.env.EVAL_LLM_STUB = "1";
  delete process.env.XAI_API_KEY;

  const response = await post({
    subject: "Paris is the capital of France.",
    context: "What is the capital of France?",
    rubricId: "default",
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    ok: boolean;
    verdict?: {
      scores: Array<{ id: string; score: number }>;
      overall: number;
      rationale: string;
      passed: boolean | null;
    };
  };
  assert.equal(payload.ok, true);
  assert.ok(payload.verdict);
  assert.ok(payload.verdict.scores.length >= 4);
  assert.equal(typeof payload.verdict.overall, "number");
  assert.equal(typeof payload.verdict.rationale, "string");
  assert.ok(payload.verdict.rationale.length > 0);
});

test("HTTP evaluate rejects empty subject without needing a model", async () => {
  process.env.EVAL_LLM_STUB = "1";
  const response = await post({ subject: "", rubricId: "default" });
  assert.equal(response.status, 400);
  const payload = (await response.json()) as { ok: boolean; code: string };
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "precheck");
});

test("HTTP evaluate returns 503 when XAI_API_KEY is unset and stub is off", async () => {
  delete process.env.EVAL_LLM_STUB;
  delete process.env.XAI_API_KEY;
  const response = await post({
    subject: "something to score",
    rubricId: "default",
  });
  assert.equal(response.status, 503);
  const payload = (await response.json()) as { ok: boolean; code: string };
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "config");
});

test("shipped xAI base URL is the documented endpoint and tests do not call it", () => {
  assert.equal(XAI_BASE_URL, "https://api.x.ai/v1");
});

test("listRubricsHttp returns the default rubric body from the shipped registry", async () => {
  const response = await listRubricsHttp();
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    ok: boolean;
    rubrics: Array<{
      id: string;
      name: string;
      criteria: Array<{ id: string }>;
    }>;
  };
  assert.equal(payload.ok, true);
  const listed = payload.rubrics.find((rubric) => rubric.id === DEFAULT_RUBRIC.id);
  assert.ok(listed);
  assert.equal(listed.name, DEFAULT_RUBRIC.name);
  assert.deepEqual(
    listed.criteria.map((criterion) => criterion.id),
    DEFAULT_RUBRIC.criteria.map((criterion) => criterion.id),
  );
});

test("HTTP evaluate rejects a non-JSON body", async () => {
  const response = await evaluateHttp(
    new Request("http://local/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
  );
  assert.equal(response.status, 400);
  const payload = (await response.json()) as { ok: boolean; code: string };
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "precheck");
});

test("saveRubricHttp then list includes the rubric and evaluate resolves its id", async () => {
  process.env.EVAL_LLM_STUB = "1";
  await migrate();
  const id = trackRubricId(`http-rubric-${Date.now()}`);
  try {
    const rubricBody = {
      id,
      version: "1",
      name: "HTTP stored rubric",
      description: "Created by http test",
      overallPassRule: "weighted_average",
      overallPassThreshold: 3,
      criteria: [
        {
          id: "accuracy",
          name: "Accuracy",
          description: "Correctness",
          scale: { min: 1, max: 5 },
          weight: 1,
          passThreshold: 3,
        },
      ],
    };

    const saveResponse = await saveRubricHttp(
      new Request("http://local/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rubricBody),
      }),
    );
    assert.equal(saveResponse.status, 200);
    const saved = (await saveResponse.json()) as {
      ok: boolean;
      rubric?: { id: string; name: string };
    };
    assert.equal(saved.ok, true);
    assert.equal(saved.rubric?.id, id);

    const listResponse = await listRubricsHttp();
    const listed = (await listResponse.json()) as {
      ok: boolean;
      rubrics: Array<{ id: string }>;
    };
    assert.equal(listed.rubrics.filter((rubric) => rubric.id === id).length, 1);

    const evalResponse = await post({
      subject: "A short answer that the stub will score.",
      rubricId: id,
    });
    assert.equal(evalResponse.status, 200);
    const evalPayload = (await evalResponse.json()) as {
      ok: boolean;
      verdict?: { rubricId: string; scores: Array<{ id: string }> };
    };
    assert.equal(evalPayload.ok, true);
    assert.equal(evalPayload.verdict?.rubricId, id);
    assert.equal(evalPayload.verdict?.scores[0]?.id, "accuracy");
  } finally {
    await deleteStoredRubric(id);
  }
});

test("agentic options HTTP get/put round-trips judgeModel", async () => {
  await migrate();
  const model = `http-options-model-${Date.now()}`;
  const put = await saveAgenticOptionsHttp(
    new Request("http://local/api/agentic-options", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeModel: model }),
    }),
  );
  assert.equal(put.status, 200);
  const putBody = (await put.json()) as {
    ok: boolean;
    options?: { judgeModel: string };
  };
  assert.equal(putBody.ok, true);
  assert.equal(putBody.options?.judgeModel, model);

  const get = await getAgenticOptionsHttp();
  assert.equal(get.status, 200);
  const getBody = (await get.json()) as {
    ok: boolean;
    options?: { judgeModel: string };
  };
  assert.equal(getBody.ok, true);
  assert.equal(getBody.options?.judgeModel, model);

  await saveAgenticOptionsHttp(
    new Request("http://local/api/agentic-options", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeModel: DEFAULT_JUDGE_MODEL }),
    }),
  );
});

test("evaluate resolves a rubric previously saved via the store", async () => {
  process.env.EVAL_LLM_STUB = "1";
  await migrate();
  const id = trackRubricId(`store-then-eval-${Date.now()}`);
  try {
    await saveStoredRubric({
      id,
      version: "1",
      name: "Direct store rubric",
      description: "",
      overallPassRule: "all_must_pass",
      overallPassThreshold: 3,
      criteria: [
        {
          id: "clarity",
          name: "Clarity",
          description: "Readable",
          scale: { min: 1, max: 5 },
          weight: 1,
          passThreshold: 3,
        },
      ],
    });

    const response = await post({
      subject: "Clear prose for the stub.",
      rubricId: id,
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      ok: boolean;
      verdict?: { rubricId: string; scores: Array<{ id: string }> };
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.verdict?.rubricId, id);
    assert.equal(payload.verdict?.scores[0]?.id, "clarity");
  } finally {
    await deleteStoredRubric(id);
  }
});
